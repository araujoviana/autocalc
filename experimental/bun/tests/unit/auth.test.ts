import { expect, test } from "bun:test";
import { parseCurl, cookieHeader, sessionStatus } from "../../src/core/auth.ts";
test("imports only allowed curl headers without executing shell text", () => {
  expect(parseCurl("curl 'https://example.test' -H 'Cookie: a=1; csrf=x' -H 'User-Agent: Agent' -H 'Authorization: unsafe'"))
    .toEqual({ cookie: "a=1; csrf=x", csrf: "x", userAgent: "Agent" });
  expect(cookieHeader([{ name: "a", value: "1", domain: ".huaweicloud.com" }, { name: "bad", value: "2", domain: "evilhuaweicloud.com" }])).toBe("a=1");
  expect(parseCurl('Invoke-WebRequest -Headers @{ "Cookie" = "csrf=synthetic; a=1" }')).toMatchObject({ cookie: "csrf=synthetic; a=1", csrf: "synthetic" });
});
test("status exposes cookie names but never cookie values", () => {
  const result = sessionStatus({ cookie_header: "csrf=secret; sid=private", saved_at: 100, source: "login", profile: "demo" }, 3700);
  expect(result).toMatchObject({ available: true, cookie_names: ["csrf", "sid"], cookie_count: 2, age_hours: 1 });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(sessionStatus(undefined)).toMatchObject({ available: false });
});

test("legacy cURL migration verifies the stored session before removing the source", async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { SessionStore } = await import("../../src/core/session-store.ts");
  const { migrateLegacySession } = await import("../../src/core/auth.ts");
  const directory = await mkdtemp(join(tmpdir(), "autocalc-migration-"));
  const path = join(directory, ".session.curl");
  try {
    await writeFile(path, "curl -H 'Cookie: csrf=synthetic; session=synthetic' -H 'User-Agent: synthetic-agent'");
    const store = new SessionStore(directory);
    expect(await migrateLegacySession(store, path, "default")).toBe(true);
    expect((await store.load())?.cookie_header).toBe("csrf=synthetic; session=synthetic");
    expect((await store.load())?.csrf).toBe("synthetic");
    expect((await store.load())?.user_agent).toBe("synthetic-agent");
    expect(await readFile(path, "utf8").catch(() => undefined)).toBeUndefined();
    await writeFile(path, "curl -H 'Cookie: session=other'");
    expect(await migrateLegacySession(store, path, "default")).toBe(false);
    expect(await readFile(path, "utf8")).toContain("session=other");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("failed session verification leaves legacy credentials in place", async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { migrateLegacySession } = await import("../../src/core/auth.ts");
  const directory = await mkdtemp(join(tmpdir(), "autocalc-migration-fail-"));
  const path = join(directory, ".session.curl");
  try {
    const source = "curl -H 'Cookie: session=synthetic'";
    await writeFile(path, source);
    const broken = { load: async () => undefined, save: async () => {} } as unknown as import("../../src/core/session-store.ts").SessionStore;
    await expect(migrateLegacySession(broken, path, "default")).rejects.toThrow("verify migrated session");
    expect(await readFile(path, "utf8")).toBe(source);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("legacy repo session is found when launched from another directory", async () => {
  const { cp, mkdir, mkdtemp, rm, symlink, writeFile, access } = await import("node:fs/promises");
  const { join, resolve } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const directory = await mkdtemp(join(tmpdir(), "autocalc-legacy-cwd-"));
  const repo = join(directory, "repo"), other = join(directory, "other"), config = join(directory, "config");
  await mkdir(join(repo, "src"), { recursive: true });
  await mkdir(other);
  await cp(resolve("src/core"), join(repo, "src/core"), { recursive: true });
  await symlink(resolve("node_modules"), join(repo, "node_modules"), "dir");
  await writeFile(join(repo, ".session.curl"), "curl -H 'Cookie: sid=synthetic'");
  const server = Bun.serve({ port: 0, fetch: request => Response.json({ verified: request.headers.get("cookie") === "sid=synthetic" }) });
  const script = `const { AuthManager } = await import(process.env.TEST_AUTH_MODULE); const auth = new AuthManager({ profile: "test", configDir: process.env.TEST_CONFIG, profileDir: process.env.TEST_CONFIG }); try { const response = await auth.call("GET", process.env.TEST_URL); if (!response.body.verified) process.exitCode = 1; } finally { await auth.close(); }`;
  try {
    const proc = Bun.spawn([process.execPath, "-e", script], { cwd: other, env: { ...process.env, AUTOCALC_SESSION: "", TEST_AUTH_MODULE: join(repo, "src/core/auth.ts"), TEST_CONFIG: config, TEST_URL: server.url.href }, stdout: "pipe", stderr: "pipe" });
    const [stderr, exit] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    expect({ exit, stderr }).toEqual({ exit: 0, stderr: "" });
    await expect(access(join(repo, ".session.curl"))).rejects.toThrow();
  } finally { server.stop(); await rm(directory, { recursive: true, force: true }); }
}, 15000);

test("cancelling login interrupts browser navigation", async () => {
  const { AuthManager } = await import("../../src/core/auth.ts");
  const controller = new AbortController();
  let began!: () => void, stop!: (error: Error) => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const page = { goto: async () => { began(); await new Promise<void>((_resolve, reject) => { stop = reject; }); }, close: async () => { stop(new Error("closed")); } };
  const browser = { withProfile: async (_headed: boolean, operation: (context: unknown) => Promise<unknown>) => operation({ pages: () => [page] }), close: async () => {} } as unknown as import("../../src/core/browser.ts").BrowserManager;
  const auth = new AuthManager({ profile: "test", configDir: "/unused", profileDir: "/unused", browser });
  try {
    const result = auth.login(60, true, controller.signal);
    await started;
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: "CANCELLED" });
  } finally { await auth.close(); }
});

test("an explicit session file supplies the compatible request headers", async () => {
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { AuthManager } = await import("../../src/core/auth.ts");
  const directory = await mkdtemp(join(tmpdir(), "autocalc-explicit-session-"));
  const path = join(directory, "session.curl");
  const server = Bun.serve({ port: 0, fetch(request) { return Response.json({ verified: request.headers.get("cookie") === "csrf=synthetic; session=synthetic" && request.headers.get("csrf") === "synthetic" && request.headers.get("user-agent") === "synthetic-agent" }); } });
  await writeFile(path, "curl -H 'Cookie: csrf=synthetic; session=synthetic' -H 'User-Agent: synthetic-agent'");
  const auth = new AuthManager({ profile: "test", configDir: directory, profileDir: join(directory, "profile"), sessionFile: path });
  try { expect(await auth.call("GET", server.url.href)).toMatchObject({ status: 200, body: { verified: true } }); }
  finally { await auth.close(); server.stop(); await rm(directory, { recursive: true, force: true }); }
});

test("refresh retries with newly acquired cookies instead of the stale explicit session file", async () => {
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { AuthManager } = await import("../../src/core/auth.ts");
  const { ListSession } = await import("../../src/core/lists.ts");
  const directory = await mkdtemp(join(tmpdir(), "autocalc-refresh-"));
  const path = join(directory, "session.curl");
  await writeFile(path, "curl -H 'Cookie: csrf=old; sid=old' -H 'User-Agent: test-agent'");
  const headers: string[] = [];
  const server = Bun.serve({ port: 0, fetch(request) {
    headers.push(`${request.headers.get("cookie")}|${request.headers.get("csrf")}|${request.headers.get("user-agent")}`);
    return Response.json(request.headers.get("cookie")?.includes("sid=fresh") ? { retCode: "200", lists: [] } : { retCode: "CBC.0101" });
  } });
  const page = { goto: async () => {}, close: async () => {} };
  const browser = { withProfile: async (_headed: boolean, operation: (context: unknown) => Promise<unknown>) => operation({ pages: () => [page], request: { get: async () => ({ ok: () => true, json: async () => ({ retCode: "200" }) }) }, cookies: async () => [{ name: "csrf", value: "fresh", domain: ".huaweicloud.com" }, { name: "sid", value: "fresh", domain: ".huaweicloud.com" }] }), close: async () => {} } as unknown as import("../../src/core/browser.ts").BrowserManager;
  const auth = new AuthManager({ profile: "test", configDir: directory, profileDir: join(directory, "profile"), sessionFile: path, browser });
  const lists = new ListSession((method, _url, body) => auth.call(method, server.url.href, body), () => auth.refresh());
  try {
    expect(await lists.lists()).toEqual([]);
    expect(headers).toEqual(["csrf=old; sid=old|old|test-agent", "csrf=fresh; sid=fresh|fresh|test-agent"]);
  } finally { await auth.close(); server.stop(); await rm(directory, { recursive: true, force: true }); }
});

test("concurrent authenticated calls share one request context", async () => {
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { request } = await import("playwright");
  const { AuthManager } = await import("../../src/core/auth.ts");
  const directory = await mkdtemp(join(tmpdir(), "autocalc-auth-concurrency-"));
  const path = join(directory, "session.curl");
  await writeFile(path, "curl -H 'Cookie: session=synthetic'");
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ ok: true }) });
  let contexts = 0;
  const factory: typeof request.newContext = async options => { contexts++; await Bun.sleep(50); return request.newContext(options); };
  const auth = new AuthManager({ profile: "test", configDir: directory, profileDir: join(directory, "profile"), sessionFile: path, requestFactory: factory });
  try {
    const results = await Promise.all(Array.from({ length: 5 }, () => auth.call("GET", server.url.href)));
    expect(results.every(result => result.status === 200)).toBe(true);
    expect(contexts).toBe(1);
  } finally { await auth.close(); server.stop(); await rm(directory, { recursive: true, force: true }); }
});

test("closing during request initialization disposes the eventual context", async () => {
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { request } = await import("playwright");
  const { AuthManager } = await import("../../src/core/auth.ts");
  const directory = await mkdtemp(join(tmpdir(), "autocalc-auth-start-"));
  const path = join(directory, "session.curl");
  await writeFile(path, "curl -H 'Cookie: session=synthetic'");
  let began!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let disposed = false;
  const factory: typeof request.newContext = async options => {
    began(); await gate;
    const context = await request.newContext(options), dispose = context.dispose.bind(context);
    context.dispose = async (...args) => { await dispose(...args); disposed = true; };
    return context;
  };
  const auth = new AuthManager({ profile: "test", configDir: directory, profileDir: join(directory, "profile"), sessionFile: path, requestFactory: factory });
  try {
    const pending = auth.call("GET", "http://127.0.0.1:1/");
    const rejected = pending.then(() => undefined, error => error as unknown);
    await started;
    const closing = auth.close();
    release();
    expect(await rejected).toMatchObject({ code: "CANCELLED" });
    await closing;
    expect(disposed).toBe(true);
    await auth.close();
  } finally { release(); await auth.close(); await rm(directory, { recursive: true, force: true }); }
});
