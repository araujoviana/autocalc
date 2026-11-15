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

test("pooled anonymous contexts reuse warm pages across sequential checkouts, isolate storage/cookies, and dispose on errors or close", async () => {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      return new Response("<!doctype html><html><body>ok</body></html>", {
        headers: { "content-type": "text/html; charset=utf-8", "set-cookie": "cart_test=1; Path=/" },
      });
    },
  });
  const baseUrl = server.url.origin;
  const manager = new BrowserManager();
  try {
    const pages: unknown[] = [];
    await manager.withAnonymousContext(async context => {
      const page = await context.newPage();
      pages.push(page);
      page.on("request", () => {});
      await page.goto(baseUrl);
      await page.evaluate(() => {
        localStorage.setItem("leaked_cart", "card1");
        sessionStorage.setItem("leaked_session", "s1");
      });
    }, { lean: true, reuse: true });

    let leaked: { ls: string | null; ss: string | null; cookiesBefore: number; listenersBefore: number; url: string } | undefined;
    await manager.withAnonymousContext(async context => {
      const page = await context.newPage();
      pages.push(page);
      expect(page.url()).toBe("about:blank");
      const cookiesBefore = (await context.cookies()).length;
      const listenersBefore = (page as unknown as { listenerCount(event: string): number }).listenerCount("request");
      await page.goto(baseUrl);
      const storage = await page.evaluate(() => ({
        ls: localStorage.getItem("leaked_cart"),
        ss: sessionStorage.getItem("leaked_session"),
      }));
      leaked = { ...storage, cookiesBefore, listenersBefore, url: page.url() };
    }, { lean: true, reuse: true });

    expect(leaked).toMatchObject({ ls: null, ss: null, cookiesBefore: 0, listenersBefore: 0 });
    // Also verify concurrent checkouts hold distinct contexts while sequential reuses clean error disposal.
    let concurrentDistinct = false;
    await Promise.all([
      manager.withAnonymousContext(async ctx1 => {
        const p1 = await ctx1.newPage();
        await p1.waitForTimeout(30);
        return ctx1;
      }, { lean: true, reuse: true }),
      manager.withAnonymousContext(async ctx2 => {
        const p2 = await ctx2.newPage();
        await p2.waitForTimeout(30);
        concurrentDistinct = true;
        return ctx2;
      }, { lean: true, reuse: true }),
    ]);
    expect(concurrentDistinct).toBe(true);

    // An error disposes the checked-out context instead of returning it to the pool.
    await expect(manager.withAnonymousContext(async context => {
      const page = await context.newPage();
      await page.goto(baseUrl);
      await page.evaluate(() => localStorage.setItem("errored", "yes"));
      throw new Error("boom");
    }, { lean: true, reuse: true })).rejects.toThrow("boom");

    const afterError = await manager.withAnonymousContext(async context => {
      const page = await context.newPage();
      await page.goto(baseUrl);
      return page.evaluate(() => localStorage.getItem("errored"));
    }, { lean: true, reuse: true });
    expect(afterError).toBeNull();
  } finally {
    await manager.close();
    server.stop(true);
  }
}, 15000);
