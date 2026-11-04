import { expect, test, spyOn } from "bun:test";
import { chromium } from "playwright";
import { BrowserManager } from "../../src/core/browser.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("concurrent anonymous operations share a browser and close idempotently", async () => {
  const manager = new BrowserManager();
  const [first, second] = await Promise.all([manager.getBrowser(), manager.getBrowser()]);
  expect(first).toBe(second);
  expect(first.isConnected()).toBe(true);
  await manager.close();
  await manager.close();
  expect(first.isConnected()).toBe(false);
}, 15000);

test("closing during anonymous launch closes the eventual browser", async () => {
  const manager = new BrowserManager();
  const starting = manager.getBrowser();
  await manager.close();
  expect((await starting).isConnected()).toBe(false);
}, 15000);

test("persistent context is leased and released on close", async () => {
  const path = await mkdtemp(join(tmpdir(), "autocalc-browser-"));
  const first = new BrowserManager({ profilePath: path });
  const second = new BrowserManager({ profilePath: path });
  try {
    await first.withProfile(false, async context => { expect(context.pages().length).toBeGreaterThan(0); });
    await expect(second.withProfile(false, async () => {})).rejects.toMatchObject({ code: "PROFILE_BUSY" });
    await first.close();
    await second.withProfile(false, async context => { expect(context.pages().length).toBeGreaterThan(0); });
  } finally { await first.close(); await second.close(); await rm(path, { recursive: true, force: true }); }
}, 15000);

test("close interrupts an active persistent context before draining its queue", async () => {
  const path = await mkdtemp(join(tmpdir(), "autocalc-active-profile-"));
  const manager = new BrowserManager({ profilePath: path });
  let ready!: () => void;
  const opened = new Promise<void>(resolve => { ready = resolve; });
  const active = manager.withProfile(false, async context => {
    const closed = new Promise<void>(resolve => context.once("close", () => resolve()));
    ready();
    await closed;
  });

  try {
    await opened;
    await manager.close();
    await active;
    const next = new BrowserManager({ profilePath: path });
    try { await next.withProfile(false, async () => {}); }
    finally { await next.close(); }
  } finally { await manager.close(); await rm(path, { recursive: true, force: true }); }
}, 15000);

test("closing while an anonymous context starts prevents new work", async () => {
  let began!: () => void, release!: () => void, calls = 0, contextClosed = false;
  const started = new Promise<void>(resolve => { began = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const context = { close: async () => { contextClosed = true; } };
  const browser = { isConnected: () => true, on: () => {}, close: async () => {}, newContext: async () => { began(); await gate; return context; } };
  const launch = spyOn(chromium, "launch").mockImplementation(async () => browser as unknown as import("playwright").Browser);
  const manager = new BrowserManager();
  try {
    const pending = manager.withAnonymousContext(async () => { calls++; });
    const outcome = pending.then(() => null, error => error);
    await started;
    await manager.close();
    release();
    expect(await outcome).toMatchObject({ code: "CANCELLED" });
    expect(calls).toBe(0);
    expect(contextClosed).toBe(true);
  } finally { release(); await manager.close(); launch.mockRestore(); }
});
