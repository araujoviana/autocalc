import { chromium } from "playwright";
import type { Browser, BrowserContext } from "playwright";
import { CalculatorError } from "./errors.ts";
import { ProfileLease } from "./profile-lease.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function discoverBrowserExecutable(override?: string): string | undefined {
  if (override) return override;
  for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge", "microsoft-edge-stable"]) {
    const path = Bun.which(name); if (path) return path;
  }
  if (process.platform === "win32") {
    for (const root of [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]) if (root) {
      for (const relative of [["Google", "Chrome", "Application", "chrome.exe"], ["Microsoft", "Edge", "Application", "msedge.exe"]]) { const path = join(root, ...relative); if (existsSync(path)) return path; }
    }
  }
  return undefined;
}

const MAX_SLOT_USES = 25;
const MAX_IDLE_SLOTS = 8;

type AnonymousPage = Awaited<ReturnType<BrowserContext["newPage"]>>;
interface AnonymousSlot {
  context: BrowserContext;
  page: AnonymousPage;
  uses: number;
}

function wrapPooledPage(page: AnonymousPage, tracked: Array<[string, (...args: unknown[]) => void]>): AnonymousPage {
  return new Proxy(page, {
    get(target, prop) {
      if (prop === "on" || prop === "addListener") {
        return (event: string, listener: (...args: unknown[]) => void) => {
          tracked.push([String(event), listener]);
          return (target.on as (e: string, l: (...args: unknown[]) => void) => unknown)(event, listener);
        };
      }
      if (prop === "once") {
        return (event: string, listener: (...args: unknown[]) => void) => {
          tracked.push([String(event), listener]);
          return (target.once as (e: string, l: (...args: unknown[]) => void) => unknown)(event, listener);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

function wrapPooledContext(context: BrowserContext, page: AnonymousPage): BrowserContext {
  let handedOut = false;
  return new Proxy(context, {
    get(target, prop) {
      if (prop === "newPage") {
        return async () => {
          if (!handedOut) {
            handedOut = true;
            return page;
          }
          return target.newPage();
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

export class BrowserManager {
  private browser: Browser | undefined;
  private starting: Promise<Browser> | undefined;
  private closing: Promise<void> | undefined;
  private closed = false;
  private profile: BrowserContext | undefined;
  private profileHeaded: boolean | undefined;
  private lease: ProfileLease | undefined;
  private queue: Promise<void> = Promise.resolve();
  private idleSlots: AnonymousSlot[] = [];
  constructor(private readonly options: { headed?: boolean; executable?: string; profilePath?: string } = {}) {}
  async getBrowser(): Promise<Browser> {
    if (this.closed) throw new CalculatorError("BROWSER_UNAVAILABLE", "Browser manager is closed");
    if (this.browser?.isConnected()) return this.browser;
    if (!this.starting) {
      const executable = discoverBrowserExecutable(this.options.executable);
      this.starting = chromium.launch({ headless: !this.options.headed,
        ...(executable ? { executablePath: executable } : {}) }).then(browser => {
        this.browser = browser;
        browser.on("disconnected", () => { if (this.browser === browser) this.browser = undefined; });
        return browser;
      }).finally(() => { this.starting = undefined; });
    }
    return this.starting;
  }
  /** A fresh, cookie-less context. `page` options mirror the Python page_context: en-US at the form's viewport,
   * `lean` skips images, fonts and media (the form needs none; about 15% faster loads) unless watching headed. */
  private takeIdleSlot(): AnonymousSlot | undefined {
    while (this.idleSlots.length > 0) {
      const slot = this.idleSlots.pop()!;
      if (!slot.page.isClosed()) return slot;
      void slot.context.close().catch(() => {});
    }
    return undefined;
  }

  private async releasePooledSlot(slot: AnonymousSlot, failed: boolean, tracked: Array<[string, (...args: unknown[]) => void]>): Promise<void> {
    if (failed || this.closed || slot.page.isClosed() || slot.uses + 1 >= MAX_SLOT_USES || this.idleSlots.length >= MAX_IDLE_SLOTS) {
      await slot.context.close().catch(() => {});
      return;
    }
    try {
      for (const [event, listener] of tracked) {
        (slot.page.off as (e: string, l: (...args: unknown[]) => void) => unknown)(event, listener);
      }
      for (const extra of slot.context.pages()) {
        if (extra !== slot.page) await extra.close().catch(() => {});
      }
      // Clear web storage on the active origin before navigating to about:blank (about:blank denies localStorage access).
      await slot.page.evaluate(() => {
        try { globalThis.localStorage?.clear(); } catch { /* ignore */ }
        try { globalThis.sessionStorage?.clear(); } catch { /* ignore */ }
      });
      await slot.context.clearCookies();
      await slot.page.goto("about:blank", { waitUntil: "load" });
      if (this.closed || slot.page.isClosed() || this.idleSlots.length >= MAX_IDLE_SLOTS) {
        await slot.context.close().catch(() => {});
        return;
      }
      this.idleSlots.push({ context: slot.context, page: slot.page, uses: slot.uses + 1 });
    } catch {
      await slot.context.close().catch(() => {});
    }
  }

  async withAnonymousContext<T>(operation: (context: BrowserContext) => Promise<T>, page?: { lean?: boolean; reuse?: boolean }): Promise<T> {
    const browser = await this.getBrowser();
    if (this.closed) throw new CalculatorError("CANCELLED", "Browser operation cancelled during shutdown");
    const pooled = Boolean(page?.lean && page?.reuse && !this.options.headed);
    if (!pooled) {
      const context = await browser.newContext(page ? { viewport: { width: 1366, height: 900 }, locale: "en-US" } : {});
      try {
        if (page?.lean && !this.options.headed) await context.route("**/*", route => ["image", "font", "media"].includes(route.request().resourceType()) ? route.abort() : route.continue());
        if (this.closed) throw new CalculatorError("CANCELLED", "Browser operation cancelled during shutdown");
        return await operation(context);
      } finally { await context.close(); }
    }

    let slot = this.takeIdleSlot();
    if (!slot) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "en-US" });
      try {
        await context.route("**/*", route => ["image", "font", "media"].includes(route.request().resourceType()) ? route.abort() : route.continue());
        if (this.closed) throw new CalculatorError("CANCELLED", "Browser operation cancelled during shutdown");
        slot = { context, page: await context.newPage(), uses: 0 };
      } catch (error) {
        await context.close().catch(() => {});
        throw error;
      }
    }
    const tracked: Array<[string, (...args: unknown[]) => void]> = [];
    const proxiedPage = wrapPooledPage(slot.page, tracked);
    const proxiedContext = wrapPooledContext(slot.context, proxiedPage);
    let failed = false;
    try {
      if (this.closed) throw new CalculatorError("CANCELLED", "Browser operation cancelled during shutdown");
      return await operation(proxiedContext);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      await this.releasePooledSlot(slot, failed, tracked);
    }
  }
  async withProfile<T>(headed: boolean, operation: (context: BrowserContext) => Promise<T>): Promise<T> {
    if (this.closed) throw new CalculatorError("BROWSER_UNAVAILABLE", "Browser manager is closed");
    const run = this.queue.then(async () => {
      if (this.closed) throw new CalculatorError("BROWSER_UNAVAILABLE", "Browser manager is closed");
      const path = this.options.profilePath;
      if (!path) throw new CalculatorError("VALIDATION", "Authentication profile path is required");
      this.lease ??= await ProfileLease.acquire(path);
      if (this.profile && this.profileHeaded !== headed) { await this.profile.close(); this.profile = undefined; }
      if (!this.profile) {
        try {
          const executable = discoverBrowserExecutable(this.options.executable);
          this.profile = await chromium.launchPersistentContext(path, { headless: !headed, viewport: { width: 1366, height: 900 }, args: ["--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage"], ...(executable ? { executablePath: executable } : {}) });
          this.profileHeaded = headed;
        } catch (error) { await this.lease.release(); this.lease = undefined; throw error; }
      }
      if (this.closed) throw new CalculatorError("BROWSER_UNAVAILABLE", "Browser manager is closed");
      return operation(this.profile);
    });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }
  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    const pooled = this.idleSlots.splice(0);
    this.closing = (async () => {
      // Closing an active context interrupts navigation and lets queued work finish.
      const initialProfile = this.profile;
      const initialClose = Promise.allSettled([initialProfile?.close(), ...pooled.map(slot => slot.context.close())]);
      await this.queue;
      const browser = this.browser ?? await this.starting?.catch(() => undefined);
      const results = [...await initialClose, ...await Promise.allSettled([this.profile !== initialProfile ? this.profile?.close() : undefined, ...this.idleSlots.splice(0).map(slot => slot.context.close()), browser?.close()])];
      this.profile = undefined;
      this.browser = undefined;
      try { await this.lease?.release(); } finally { this.lease = undefined; }
      const failed = results.find(result => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    })();
    return this.closing;
  }
}
