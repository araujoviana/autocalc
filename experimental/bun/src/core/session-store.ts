import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { CalculatorError } from "./errors.ts";

/** The login lives in the browser profile directory, in the file Python writes (ADR-0011, D4). No keyring. */
export const SESSION_FILE = "autocalc-session";
export interface SessionRecord { cookie: string; account_mask?: string | null | undefined }
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
  constructor(profileDir: string) { this.path = join(profileDir, SESSION_FILE); }
  /** A missing or unreadable file means "not signed in", as in Python. */
  async load(): Promise<(Required<SessionRecord> & { saved_at: number }) | undefined> {
    try {
      const data = JSON.parse(await readFile(this.path, "utf8")) as { cookie?: unknown; account_mask?: unknown };
      if (typeof data.cookie !== "string" || !data.cookie) return undefined;
      return { cookie: data.cookie, account_mask: typeof data.account_mask === "string" ? data.account_mask : null, saved_at: (await stat(this.path)).mtimeMs / 1000 };
    } catch { return undefined; }
  }
  async save(session: SessionRecord): Promise<void> {
    await mkdir(join(this.path, ".."), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ cookie: session.cookie, account_mask: session.account_mask ?? null }), { mode: 0o600 });
      await chmod(temporary, 0o600); // no-op on Windows, which inherits the user-profile ACL
      await rename(temporary, this.path);
    } finally { await unlink(temporary).catch(() => undefined); }
  }
  async clear(): Promise<void> { await unlink(this.path).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }); }
}
