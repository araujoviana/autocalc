import { randomUUID } from "node:crypto";
import { access, chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CalculatorError } from "./errors.ts";

const sessionSchema = z.object({ cookie_header: z.string(), csrf: z.string().optional(), user_agent: z.string().optional(), account_mask: z.string().nullable().optional(), saved_at: z.number().finite(), source: z.string().default("login"), profile: z.string().default("default") });
export type SessionRecord = z.input<typeof sessionSchema>;
export interface CredentialBackend { get(key: string): Promise<string | undefined>; set(key: string, value: string): Promise<boolean>; clear(key: string): Promise<void> }
export function systemCredentialBackend(): CredentialBackend | undefined {
  const executable = process.platform === "linux" ? Bun.which("secret-tool") : process.platform === "darwin" ? Bun.which("security") : null;
  if (!executable) return undefined;
  const run = async (args: string[], input?: string) => {
    const child = Bun.spawn([executable, ...args], { stdin: input === undefined ? "ignore" : "pipe", stdout: "pipe", stderr: "pipe" });
    if (input !== undefined && child.stdin && typeof child.stdin !== "number") { child.stdin.write(input); child.stdin.end(); }
    const timer = setTimeout(() => child.kill(), 5000);
    try { const [out, , status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]); return { out, status }; }
    finally { clearTimeout(timer); }
  };
  if (process.platform === "darwin") {
    const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    return {
      async get(key) { const result = await run(["find-generic-password", "-s", "autocalc", "-a", key, "-w"]); return result.status === 0 ? result.out.replace(/\r?\n$/, "") : undefined; },
      async set(key, value) { return (await run(["-i"], `add-generic-password -U -s autocalc -a ${quote(key)} -w ${quote(value)}\n`)).status === 0; },
      async clear(key) { await run(["delete-generic-password", "-s", "autocalc", "-a", key]); },
    };
  }
  return {
    async get(key) { const result = await run(["lookup", "service", "autocalc", "username", key]); return result.status === 0 ? result.out.replace(/\r?\n$/, "") : undefined; },
    async set(key, value) { return (await run(["store", "--label=autocalc session", "service", "autocalc", "username", key], value)).status === 0; },
    async clear(key) { await run(["clear", "service", "autocalc", "username", key]); },
  };
}
export function allowCookieDomain(domain: string): boolean {
  const normalized = domain.toLowerCase().replace(/^\./, "");
  return normalized === "huaweicloud.com" || normalized.endsWith(".huaweicloud.com");
}
export function validateProfile(profile: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(profile)) throw new CalculatorError("VALIDATION", "Invalid profile name", "Use letters, digits, hyphens and underscores.");
  return profile;
}
export class SessionStore {
  readonly path: string;
  private readonly key: string;
  private readonly logoutMarker: string;
  backendName = "file";
  constructor(private readonly directory: string, profile = "default", private readonly backend?: CredentialBackend) {
    validateProfile(profile);
    this.key = `session:${profile}`;
    this.path = join(directory, profile === "default" ? "session.json" : `session-${profile}.json`);
    this.logoutMarker = join(directory, profile === "default" ? ".logged-out" : `.logged-out-${profile}`);
  }
  async load(): Promise<z.output<typeof sessionSchema> | undefined> {
    let content: string;
    const secret = await this.backend?.get(this.key).catch(() => undefined);
    if (secret) { content = secret; this.backendName = "credential store"; }
    else try { content = await readFile(this.path, "utf8"); this.backendName = "file"; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    try { return sessionSchema.parse(JSON.parse(content) as unknown); }
    catch { throw new CalculatorError("UNEXPECTED_RESPONSE", "Stored session is invalid"); }
  }
  async save(session: SessionRecord): Promise<void> {
    const parsed = sessionSchema.parse(session);
    const serialized = JSON.stringify(parsed);
    const backend = this.backend;
    if (backend && await backend.set(this.key, serialized).catch(() => false)) {
      if (await backend.get(this.key).catch(() => undefined) === serialized) {
        this.backendName = "credential store";
        await unlink(this.path).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
        return;
      }
      await backend.clear(this.key).catch(() => undefined);
    }
    this.backendName = "file";
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, this.path);
    } finally { await unlink(temporary).catch(() => undefined); }
  }
  async clear(): Promise<void> { await this.backend?.clear(this.key).catch(() => undefined); await unlink(this.path).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }); }
  async markLoggedOut(): Promise<void> { await mkdir(this.directory, { recursive: true, mode: 0o700 }); await writeFile(this.logoutMarker, "logged out\n", { mode: 0o600 }); }
  async isLoggedOut(): Promise<boolean> { try { await access(this.logoutMarker); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; } }
  async clearLogoutMarker(): Promise<void> { await unlink(this.logoutMarker).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }); }
}
