import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SESSION_FILE, SessionStore, allowCookieDomain } from "../../src/core/session-store.ts";

test("the login is one 0600 file in the profile, in the shape Python writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "autocalc-session-"));
  try {
    const store = new SessionStore(join(dir, "profile"));
    expect(store.path).toBe(join(dir, "profile", SESSION_FILE));
    await store.save({ cookie: "synthetic=secret", account_mask: "a***b" });
    if (process.platform !== "win32") expect((await stat(store.path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(store.path, "utf8"))).toEqual({ cookie: "synthetic=secret", account_mask: "a***b" });
    expect(await store.load()).toMatchObject({ cookie: "synthetic=secret", account_mask: "a***b" });
    await store.clear();
    expect(await store.load()).toBeUndefined();
    await store.clear(); // clearing nothing is fine
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a file Python wrote loads, and a damaged one means not signed in", async () => {
  const dir = await mkdtemp(join(tmpdir(), "autocalc-session-"));
  try {
    const store = new SessionStore(dir);
    await writeFile(store.path, JSON.stringify({ cookie: "a=1", account_mask: null }));
    expect(await store.load()).toMatchObject({ cookie: "a=1", account_mask: null });
    await writeFile(store.path, "{not json");
    expect(await store.load()).toBeUndefined();
    await writeFile(store.path, JSON.stringify({ cookie: "" }));
    expect(await store.load()).toBeUndefined();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("only Huawei Cloud domains are cookie domains", () => {
  expect(allowCookieDomain("sub.huaweicloud.com")).toBe(true);
  expect(allowCookieDomain("evilhuaweicloud.com")).toBe(false);
});
