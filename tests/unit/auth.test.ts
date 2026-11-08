import { expect, test } from "bun:test";
import { cookieHeader, sessionStatus } from "../../src/core/auth.ts";
import type { CalculatorError } from "../../src/core/errors.ts";
test("only Huawei domains contribute cookies", () => {
  expect(cookieHeader([{ name: "a", value: "1", domain: ".huaweicloud.com" }, { name: "bad", value: "2", domain: "evilhuaweicloud.com" }])).toBe("a=1");
});
test("status exposes cookie names but never cookie values", () => {
  const result = sessionStatus({ cookie: "csrf=secret; sid=private", saved_at: 100 }, 3700, "demo");
  expect(result).toMatchObject({ available: true, cookie_names: ["csrf", "sid"], cookie_count: 2, age_hours: 1 });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(sessionStatus(undefined)).toMatchObject({ available: false });
});

test("cancelling login interrupts browser navigation", async () => {
  const { AuthManager } = await import("../../src/core/auth.ts");
  const controller = new AbortController();
  let began!: () => void, stop!: (error: Error) => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const page = { goto: async () => { began(); await new Promise<void>((_resolve, reject) => { stop = reject; }); }, close: async () => { stop(new Error("closed")); } };
  const browser = { withProfile: async (_headed: boolean, operation: (context: unknown) => Promise<unknown>) => operation({ pages: () => [page] }), close: async () => {} } as unknown as import("../../src/core/browser.ts").BrowserManager;
  const auth = new AuthManager({ profile: "test", profileDir: "/unused", browser });
  try {
    const result = auth.login(60, true, controller.signal);
    await started;
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: "CANCELLED" });
  } finally { await auth.close(); }
});

test("a stored login supplies the cookie and derived csrf headers", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { AuthManager } = await import("../../src/core/auth.ts");
  const directory = await mkdtemp(join(tmpdir(), "autocalc-stored-session-"));
  const server = Bun.serve({ port: 0, fetch(request) { return Response.json({ verified: request.headers.get("cookie") === "csrf=synthetic; session=synthetic" && request.headers.get("csrf") === "synthetic" }); } });
  await new (await import("../../src/core/session-store.ts")).SessionStore(join(directory, "profile")).save({ cookie: "csrf=synthetic; session=synthetic" });
  const auth = new AuthManager({ profile: "test", profileDir: join(directory, "profile") });
  try { expect(await auth.call("GET", server.url.href)).toMatchObject({ status: 200, body: { verified: true } }); }
  finally { await auth.close(); server.stop(); await rm(directory, { recursive: true, force: true }); }
});

test("refresh retries with newly acquired cookies instead of the stale stored login", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { AuthManager } = await import("../../src/core/auth.ts");
  const { ListSession } = await import("../../src/core/lists.ts");
  const directory = await mkdtemp(join(tmpdir(), "autocalc-refresh-"));
  await new (await import("../../src/core/session-store.ts")).SessionStore(join(directory, "profile")).save({ cookie: "csrf=old; sid=old" });
  const headers: string[] = [];
  const server = Bun.serve({ port: 0, fetch(request) {
    headers.push(`${request.headers.get("cookie")}|${request.headers.get("csrf")}|${request.headers.get("user-agent")}`);
    return Response.json(request.headers.get("cookie")?.includes("sid=fresh") ? { retCode: "200", lists: [] } : { retCode: "CBC.0101" });
  } });
  const page = { goto: async () => {}, close: async () => {} };
  const browser = { withProfile: async (_headed: boolean, operation: (context: unknown) => Promise<unknown>) => operation({ pages: () => [page], request: { get: async () => ({ ok: () => true, json: async () => ({ retCode: "200" }) }) }, cookies: async () => [{ name: "csrf", value: "fresh", domain: ".huaweicloud.com" }, { name: "sid", value: "fresh", domain: ".huaweicloud.com" }] }), close: async () => {} } as unknown as import("../../src/core/browser.ts").BrowserManager;
  const auth = new AuthManager({ profile: "test", profileDir: join(directory, "profile"), browser });
  const lists = new ListSession((method, _url, body) => auth.call(method, server.url.href, body), () => auth.refresh());
  try {
    expect(await lists.lists()).toEqual([]);
    expect(headers).toEqual(["csrf=old; sid=old|old|Mozilla/5.0", "csrf=fresh; sid=fresh|fresh|Mozilla/5.0"]);
  } finally { await auth.close(); server.stop(); await rm(directory, { recursive: true, force: true }); }
});

test("refresh failure on expired session clears stale store and raises AUTH_EXPIRED", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { AuthManager } = await import("../../src/core/auth.ts");
  const { ListSession } = await import("../../src/core/lists.ts");
  const { CalculatorError } = await import("../../src/core/errors.ts");
  const directory = await mkdtemp(join(tmpdir(), "autocalc-refresh-fail-"));
  const store = new (await import("../../src/core/session-store.ts")).SessionStore(join(directory, "profile"));
  await store.save({ cookie: "csrf=expired; sid=expired" });
  const server = Bun.serve({ port: 0, fetch() {
    return Response.json({ retCode: "CBC.0101" });
  } });
  const page = { goto: async () => {}, close: async () => {} };
  // Headless browser probe also fails to authenticate (session expired on server)
  const browser = {
    withProfile: async (_headed: boolean, operation: (context: unknown) => Promise<unknown>) =>
      operation({
        pages: () => [page],
        request: { get: async () => ({ ok: () => true, json: async () => ({ retCode: "CBC.0101" }) }) },
        cookies: async () => [],
      }),
    close: async () => {},
  } as unknown as import("../../src/core/browser.ts").BrowserManager;
  const auth = new AuthManager({ profile: "test", profileDir: join(directory, "profile"), browser });
  const lists = new ListSession((method, _url, body) => auth.call(method, server.url.href, body), () => auth.refresh());
  try {
    let err: unknown;
    try {
      await lists.lists();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CalculatorError);
    expect((err as CalculatorError).code).toBe("AUTH_EXPIRED");
    // Ensure the stale session on disk was cleared so auth status doesn't report signed in
    expect(await store.load()).toBeUndefined();
    const status = await auth.status();
    expect(status.logged_in).toBe(false);
  } finally {
    await auth.close();
    server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("concurrent authenticated calls share one request context", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { request } = await import("playwright");
  const { AuthManager } = await import("../../src/core/auth.ts");
  const directory = await mkdtemp(join(tmpdir(), "autocalc-auth-concurrency-"));
  await new (await import("../../src/core/session-store.ts")).SessionStore(join(directory, "profile")).save({ cookie: "session=synthetic" });
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ ok: true }) });
  let contexts = 0;
  const factory: typeof request.newContext = async options => { contexts++; await Bun.sleep(50); return request.newContext(options); };
  const auth = new AuthManager({ profile: "test", profileDir: join(directory, "profile"), requestFactory: factory });
  try {
    const results = await Promise.all(Array.from({ length: 5 }, () => auth.call("GET", server.url.href)));
    expect(results.every(result => result.status === 200)).toBe(true);
    expect(contexts).toBe(1);
  } finally { await auth.close(); server.stop(); await rm(directory, { recursive: true, force: true }); }
});

test("closing during request initialization disposes the eventual context", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { request } = await import("playwright");
  const { AuthManager } = await import("../../src/core/auth.ts");
  const directory = await mkdtemp(join(tmpdir(), "autocalc-auth-start-"));
  await new (await import("../../src/core/session-store.ts")).SessionStore(join(directory, "profile")).save({ cookie: "session=synthetic" });
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
  const auth = new AuthManager({ profile: "test", profileDir: join(directory, "profile"), requestFactory: factory });
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
