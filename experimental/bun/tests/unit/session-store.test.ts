import { expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore, allowCookieDomain } from "../../src/core/session-store.ts";

test("session storage uses protected files and rejects unsafe profile names", async () => {
  const path = await mkdtemp(join(tmpdir(), "autocalc-session-"));
  try {
    const store = new SessionStore(path, "demo");
    await store.save({ cookie_header: "synthetic=secret", saved_at: 100, source: "login", profile: "demo" });
    expect((await stat(store.path)).mode & 0o777).toBe(0o600);
    expect((await store.load())?.profile).toBe("demo");
    await store.clear();
    expect(await store.load()).toBeUndefined();
    await store.markLoggedOut();
    expect(await store.isLoggedOut()).toBe(true);
    await store.clearLogoutMarker();
    expect(await store.isLoggedOut()).toBe(false);
    expect(() => new SessionStore(path, "../unsafe")).toThrow();
    expect(allowCookieDomain("sub.huaweicloud.com")).toBe(true);
    expect(allowCookieDomain("evilhuaweicloud.com")).toBe(false);
  } finally { await rm(path, { recursive: true, force: true }); }
});

test("credential backend is preferred when available", async () => {
  const path = await mkdtemp(join(tmpdir(), "autocalc-keyring-"));
  let value: string | undefined;
  const backend = { get: async () => value, set: async (_key: string, secret: string) => { value = secret; return true; }, clear: async () => { value = undefined; } };
  try {
    const store = new SessionStore(path, "demo", backend);
    await store.save({ cookie_header: "a=secret", saved_at: 100, profile: "demo" });
    expect(value).toContain("a=secret");
    await expect(stat(store.path)).rejects.toThrow();
    expect((await store.load())?.cookie_header).toBe("a=secret");
    await store.clear();
    expect(await store.load()).toBeUndefined();
  } finally { await rm(path, { recursive: true, force: true }); }
});

test("credential storage falls back to a file when a write cannot be verified", async () => {
  const path = await mkdtemp(join(tmpdir(), "autocalc-keyring-fallback-"));
  const backend = { get: async () => undefined, set: async () => true, clear: async () => {} };
  try {
    const store = new SessionStore(path, "demo", backend);
    await store.save({ cookie_header: "synthetic=value", saved_at: 100, profile: "demo" });
    expect(store.backendName).toBe("file");
    expect((await store.load())?.cookie_header).toBe("synthetic=value");
    expect((await stat(store.path)).mode & 0o777).toBe(0o600);
  } finally { await rm(path, { recursive: true, force: true }); }
});
