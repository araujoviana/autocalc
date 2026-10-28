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

export class BrowserManager {
  private browser: Browser | undefined;
  private starting: Promise<Browser> | undefined;
  private closing: Promise<void> | undefined;
  private closed = false;
  private profile: BrowserContext | undefined;
  private profileHeaded: boolean | undefined;
  private lease: ProfileLease | undefined;
  private queue: Promise<void> = Promise.resolve();
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
  async withAnonymousContext<T>(operation: (context: BrowserContext) => Promise<T>): Promise<T> {
    const browser = await this.getBrowser();
    if (this.closed) throw new CalculatorError("CANCELLED", "Browser operation cancelled during shutdown");
    const context = await browser.newContext();
    try {
      if (this.closed) throw new CalculatorError("CANCELLED", "Browser operation cancelled during shutdown");
      return await operation(context);
    } finally { await context.close(); }
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
    this.closing = (async () => {
      // Closing an active context interrupts navigation and lets queued work finish.
      const initialProfile = this.profile;
      const initialClose = Promise.allSettled([initialProfile?.close()]);
      await this.queue;
      const browser = this.browser ?? await this.starting?.catch(() => undefined);
      const results = [...await initialClose, ...await Promise.allSettled([this.profile !== initialProfile ? this.profile?.close() : undefined, browser?.close()])];
      this.profile = undefined;
      this.browser = undefined;
      try { await this.lease?.release(); } finally { this.lease = undefined; }
      const failed = results.find(result => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    })();
    return this.closing;
  }
}
