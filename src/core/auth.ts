import { CalculatorError } from "./errors.ts";
import { allowCookieDomain } from "./session-store.ts";
import { SessionStore } from "./session-store.ts";
import { BrowserManager } from "./browser.ts";
import { endpoints, PAGE, MASK } from "./endpoints.ts";
import { request } from "playwright";
import { abortable } from "./pricing.ts";
import type { APIRequestContext } from "playwright";

export function cookieHeader(cookies: Array<{ name: string; value: string; domain: string }>): string {
  return cookies.filter(cookie => allowCookieDomain(cookie.domain)).map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
}
export function sessionStatus(session: { cookie: string; account_mask?: string | null | undefined; saved_at: number } | undefined, now = Date.now() / 1000, profile = "default") {
  if (!session) return { available: false, logged_in: false, authenticated: null, profile, hint: "Run autocalc login to sign in." };
  const names = session.cookie.split(";").map(part => part.trim().split("=")[0]).filter((name): name is string => !!name);
  return { available: true, logged_in: true, authenticated: null, profile, account_mask: session.account_mask ?? null, age_hours: Math.round((now - session.saved_at) / 36) / 100, cookies: `${names.length} cookies (${names.slice(0, 6).join(", ")}${names.length > 6 ? "..." : ""})`, cookie_names: names, cookie_count: names.length, backend: "profile" };
}
const csrfOf = (cookie: string) => cookie.split(";").map(part => part.trim()).find(part => part.startsWith("csrf="))?.slice(5);

export class AuthManager {
  private requestContext: APIRequestContext | undefined;
  private requestStarting: Promise<APIRequestContext> | undefined;
  private requestEpoch = 0;
  private refreshedCredentials: { cookie: string; csrf?: string; userAgent?: string } | undefined;
  private lastUserAgent: string | undefined;
  private readonly store: SessionStore;
  private readonly browser: BrowserManager;
  private readonly abort = new AbortController();
  private closing: Promise<void> | undefined;
  constructor(private readonly options: { profile: string; profileDir: string; executable?: string | undefined; headed?: boolean | undefined; browser?: BrowserManager | undefined; requestFactory?: typeof request.newContext | undefined }) {
    this.store = new SessionStore(options.profileDir);
    this.browser = options.browser ?? new BrowserManager({ profilePath: options.profileDir, ...(options.executable ? { executable: options.executable } : {}), ...(options.headed === undefined ? {} : { headed: options.headed }) });
  }
  async status() { const status = sessionStatus(await this.store.load(), Date.now() / 1000, this.options.profile); return status; }
  private async credentials(): Promise<{ cookie: string; csrf?: string; userAgent?: string }> {
    if (this.refreshedCredentials) return this.refreshedCredentials;
    const stored = await this.store.load();
    if (!stored) throw new CalculatorError("AUTH_REQUIRED", "No calculator session found", "Run autocalc login.");
    const csrf = csrfOf(stored.cookie);
    return { cookie: stored.cookie, ...(csrf === undefined ? {} : { csrf }) };
  }
  private async resetRequest() {
    this.requestEpoch++;
    const current = this.requestContext, starting = this.requestStarting;
    this.requestContext = undefined; this.requestStarting = undefined;
    const results = await Promise.allSettled([current?.dispose(), starting?.catch(() => undefined)]);
    if (results[0]?.status === "rejected") throw results[0].reason;
  }
  private async getRequest(): Promise<APIRequestContext> {
    if (this.abort.signal.aborted) throw new CalculatorError("CANCELLED", "Authentication is closed");
    if (this.requestContext) return this.requestContext;
    if (!this.requestStarting) {
      const epoch = this.requestEpoch;
      const starting = (async () => {
        const credentials = await this.credentials();
        this.lastUserAgent = credentials.userAgent;
        if (this.abort.signal.aborted || epoch !== this.requestEpoch) throw new CalculatorError("CANCELLED", "Authentication request was reset");
        const create = this.options.requestFactory ?? request.newContext.bind(request);
        const context = await create({ timeout: 60000, extraHTTPHeaders: { cookie: credentials.cookie, ...(credentials.csrf ? { csrf: credentials.csrf } : {}), "user-agent": credentials.userAgent ?? "Mozilla/5.0", origin: "https://www.huaweicloud.com", referer: PAGE, "content-type": "application/json" } });
        if (this.abort.signal.aborted || epoch !== this.requestEpoch) { await context.dispose(); throw new CalculatorError("CANCELLED", "Authentication request was reset"); }
        this.requestContext = context;
        return context;
      })().finally(() => { if (this.requestStarting === starting) this.requestStarting = undefined; });
      this.requestStarting = starting;
    }
    return this.requestStarting;
  }
  async call(method: "GET" | "POST", url: string, body?: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
    const context = await this.getRequest();
    const response = method === "GET" ? await context.get(url) : await context.post(url, body === undefined ? {} : { data: body });
    let result: unknown; try { result = await response.json() as unknown; } catch { result = null; }
    return { status: response.status(), body: result };
  }
  async login(timeout = 300, headed = true, signal?: AbortSignal) {
    if (signal?.aborted) throw new CalculatorError("CANCELLED", "Login cancelled");
    return this.browser.withProfile(headed, async context => {
      const deadline = Date.now() + timeout * 1000;
      const page = context.pages()[0] ?? await context.newPage();
      const cancelPage = () => { void page.close().catch(() => undefined); };
      signal?.addEventListener("abort", cancelPage, { once: true });
      if (signal?.aborted) cancelPage();
      try {
      try { await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: Math.min(headed ? 60000 : 45000, Math.max(1, deadline - Date.now())) }); } catch { /* Probe may still succeed after navigation failure. */ }
      while (Date.now() < deadline && !this.abort.signal.aborted && !signal?.aborted) {
        try {
          const response = await abortable(() => context.request.get(endpoints.list, { timeout: Math.min(15000, Math.max(1, deadline - Date.now())) }), signal);
          const body: unknown = await abortable(() => response.json(), signal);
          if (response.ok() && body !== null && typeof body === "object" && String((body as Record<string, unknown>).retCode) === "200") {
            const cookies = cookieHeader(await context.cookies());
            if (!cookies) throw new CalculatorError("AUTH_LOGIN_FAILED", "Login returned no Huawei Cloud cookies");
            let mask: string | undefined;
            try { const result: unknown = await abortable(async () => (await context.request.get(MASK, { timeout: Math.min(8000, Math.max(1, deadline - Date.now())) })).json(), signal); if (result && typeof result === "object") { const data = result as Record<string, unknown>; const value = data.maskedName ?? data.accountName ?? data.userName ?? data.masked_user; if (typeof value === "string") mask = value; } } catch { if (signal?.aborted) throw new CalculatorError("CANCELLED", "Login cancelled"); }
            if (signal?.aborted || this.abort.signal.aborted) throw new CalculatorError("CANCELLED", "Login cancelled");
            await this.store.save({ cookie: cookies, account_mask: mask ?? null });
            const csrf = csrfOf(cookies);
            this.refreshedCredentials = { cookie: cookies, ...(csrf === undefined ? {} : { csrf }), ...(this.lastUserAgent === undefined ? {} : { userAgent: this.lastUserAgent }) };
            await this.resetRequest();
            return this.status();
          }
        } catch (error) { if (error instanceof CalculatorError) throw error; }
        await new Promise<void>(resolve => {
          const finish = () => { clearTimeout(timer); this.abort.signal.removeEventListener("abort", finish); signal?.removeEventListener("abort", finish); resolve(); };
          const timer = setTimeout(finish, Math.min(2000, Math.max(0, deadline - Date.now())));
          this.abort.signal.addEventListener("abort", finish, { once: true });
          signal?.addEventListener("abort", finish, { once: true });
          if (this.abort.signal.aborted || signal?.aborted) finish();
        });
      }
      const cancelled = this.abort.signal.aborted || !!signal?.aborted;
      throw new CalculatorError(cancelled ? "CANCELLED" : "AUTH_LOGIN_FAILED", cancelled ? "Login cancelled" : "Login timed out");
      } finally { signal?.removeEventListener("abort", cancelPage); }
    });
  }
  async refresh(): Promise<void> {
    try {
      await this.login(2, false);
    } catch {
      await this.store.clear().catch(() => undefined);
      this.refreshedCredentials = undefined;
      await this.resetRequest();
      throw new CalculatorError("AUTH_EXPIRED", "Calculator session has expired", "Run 'autocalc login' to sign in again.");
    }
  }
  async logout(): Promise<void> {
    this.refreshedCredentials = undefined;
    this.lastUserAgent = undefined;
    await this.resetRequest();
    await this.store.clear();
    await this.browser.withProfile(false, async context => {
      await context.clearCookies();
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => undefined);
      if (allowCookieDomain(new URL(page.url()).hostname)) await page.evaluate(async () => {
        localStorage.clear(); sessionStorage.clear();
        for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
        for (const database of await indexedDB.databases()) if (database.name) indexedDB.deleteDatabase(database.name);
      });
      for (const openPage of context.pages()) await openPage.goto("about:blank").catch(() => undefined);
    });
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.abort.abort();
    this.closing = (async () => {
      const results = await Promise.allSettled([this.resetRequest(), this.browser.close()]);
      const failed = results.find(result => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    })();
    return this.closing;
  }
}
