import { homedir } from "node:os";
import { join } from "node:path";
import { CatalogCache } from "./cache.ts";
import { PublicTransport } from "./transport.ts";
import { CalculatorError } from "./errors.ts";
import { registry } from "./registry.ts";
import type { ActionContext } from "./registry.ts";
import { Catalog } from "./catalog.ts";
import { abortable, inquiry } from "./pricing.ts";
import { RATE } from "./endpoints.ts";
import { AuthManager } from "./auth.ts";
import { ListSession, publishLegacyEcs, shareDetail } from "./lists.ts";
import { profilePaths, resolveConfig } from "./config.ts";
import { validateList } from "./validate.ts";
import { BrowserManager } from "./browser.ts";
import { renderCheck } from "./page.ts";
import { editCheckCard } from "./edit-check-browser.ts";
import { allOk } from "./edit-check.ts";
import { doctor } from "./diagnostics.ts";
import { request } from "playwright";
import { endpoints, PAGE } from "./endpoints.ts";
import { mkdir } from "node:fs/promises";
import { ListReference } from "./schemas.ts";

export function createCore(options: { reader?: ActionContext["reader"]; catalogReader?: ConstructorParameters<typeof Catalog>[0]; rating?: ActionContext["rating"]; createList?: ActionContext["createList"]; listSession?: ActionContext["lists"]; cacheDir?: string; profile?: string; headed?: boolean } = {}) {
  const transport = options.reader && options.catalogReader && options.rating ? undefined : new PublicTransport(new CatalogCache(options.cacheDir ?? process.env.AUTOCALC_CACHE ?? join(homedir(), ".cache", "autocalc")));
  const config = resolveConfig({ ...(options.profile ? { profile: options.profile } : {}), ...(options.headed === undefined ? {} : { headed: options.headed }) });
  const paths = profilePaths(config.profile!);
  const browser = new BrowserManager({ profilePath: paths.profileDir, headed: config.headed, ...(config.executable ? { executable: config.executable } : {}) });
  const auth = new AuthManager({ profile: config.profile!, ...paths, headed: config.headed, browser, ...(config.executable ? { executable: config.executable } : {}) });
  const lists = options.listSession ?? new ListSession((method, url, body) => auth.call(method, url, body), () => auth.refresh());
  const context: ActionContext = { reader: options.reader ?? transport!, catalog: new Catalog(options.catalogReader ?? transport!), rating: options.rating ?? (body => inquiry(value => transport!.post(RATE, value), body)), createList: options.createList ?? (payload => lists.create(payload)), lists, auth };
  const temporaryAuth = new Set<AuthManager>();
  const shutdown = new AbortController();
  let closed = false, closing: Promise<void> | undefined;
  const ensureOpen = () => { if (closed) throw new CalculatorError("CANCELLED", "Core is closed"); };
  const withSignal = (base: ActionContext, signal: AbortSignal): ActionContext => ({ ...base, signal, rating: options.rating
    ? body => abortable(() => options.rating!(body), signal)
    : body => inquiry(value => transport!.post(RATE, value), body, { signal }) });
  return {
    async invoke(name: string, rawInput: unknown, invokeOptions: { signal?: AbortSignal } = {}): Promise<unknown> {
      ensureOpen();
      if (!Object.hasOwn(registry, name)) throw new CalculatorError("VALIDATION", `Unknown action ${name}`);
      const signal = invokeOptions.signal ? AbortSignal.any([shutdown.signal, invokeOptions.signal]) : shutdown.signal;
      if (signal.aborted) throw new CalculatorError("CANCELLED", "Request cancelled");
      return registry[name as keyof typeof registry].invoke(withSignal(context, signal), rawInput);
    },
    async importAuth(text: string) { ensureOpen(); return auth.importCurl(text); },
    async updatePriceList(reference: string, items: unknown, options: { dryRun?: boolean } = {}) {
      ensureOpen();
      const parsed = ListReference.safeParse(reference);
      if (!parsed.success) throw new CalculatorError("VALIDATION", "Invalid list reference");
      const id = parsed.data;
      const detail = await shareDetail(context.reader, id);
      if (typeof detail.name !== "string" || !detail.name) throw new CalculatorError("UNEXPECTED_RESPONSE", "Saved list has no name");
      let payload: Record<string, unknown> | undefined;
      const scoped = { ...context, createList: async (value: Record<string, unknown>) => { payload = value; return id; } };
      const result = await registry.create_price_list.invoke(withSignal(scoped, shutdown.signal), { name: detail.name, items, settlement: detail.billingMode === "cart.shareList.billingModeMonth" ? "monthly" : "total" }) as Record<string, unknown>;
      if (!payload) throw new CalculatorError("UNEXPECTED_RESPONSE", "Could not build update payload");
      if (shutdown.signal.aborted) throw new CalculatorError("CANCELLED", "Request cancelled");
      if (!options.dryRun) await lists.update(id, { ...detail, ...payload });
      return { ...result, id, dry_run: !!options.dryRun };
    },
    async publishLegacyEcs(name: string, items: unknown, sessionFile?: string) {
      ensureOpen();
      if (!sessionFile) return publishLegacyEcs(name, items, input => registry.create_price_list.invoke(withSignal(context, shutdown.signal), input));
      const legacyBrowser = new BrowserManager({ profilePath: paths.profileDir, headed: config.headed, ...(config.executable ? { executable: config.executable } : {}) });
      const legacyAuth = new AuthManager({ profile: config.profile!, ...paths, sessionFile, browser: legacyBrowser, headed: config.headed, ...(config.executable ? { executable: config.executable } : {}) });
      const legacyLists = new ListSession((method, url, body) => legacyAuth.call(method, url, body), () => legacyAuth.refresh());
      temporaryAuth.add(legacyAuth);
      try {
        const scoped = { ...context, createList: (payload: Record<string, unknown>) => legacyLists.create(payload) };
        return await publishLegacyEcs(name, items, input => registry.create_price_list.invoke(withSignal(scoped, shutdown.signal), input));
      } finally { try { await legacyAuth.close(); } finally { temporaryAuth.delete(legacyAuth); } }
    },
    async logout() { ensureOpen(); return auth.logout(); },
    async validate(reference: string) { ensureOpen(); return validateList(await shareDetail(context.reader, reference)); },
    async renderCheck(reference: string) { ensureOpen(); return renderCheck(browser, reference); },
    async editCheck(reference: string, limit?: number, screenshotDirectory?: string) {
      ensureOpen();
      const detail = await shareDetail(context.reader, reference);
      const cards = limit === undefined ? detail.cartListData : detail.cartListData.slice(0, limit);
      const results = [];
      if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
      for (const [index, card] of cards.entries()) results.push(await editCheckCard(browser, index, card, screenshotDirectory ? { screenshotPath: join(screenshotDirectory, `card-${index + 1}.png`) } : {}));
      return { ok: allOk(results), results };
    },
    async doctor() {
      ensureOpen();
      const http = await request.newContext({ timeout: 15000 });
      try {
        return await doctor(async name => {
          if (name === "menu") { await context.catalog.menu(); return { ok: true }; }
          if (name === "product") { await context.catalog.productInfo("ecs", "sa-brazil-1"); return { ok: true }; }
          if (name === "rating") {
            const response = await http.post(RATE, { timeout: 15000, headers: { origin: "https://www.huaweicloud.com" }, data: { regionId: "sa-brazil-1", chargingMode: 0, periodType: 2, periodNum: 1, subscriptionNum: 1, siteCode: "HWC", productInfos: [{ id: "a", cloudServiceType: "hws.service.type.ec2", resourceType: "hws.resource.type.vm", resourceSpecCode: "c7n.large.2.linux", productNum: 1 }] } });
            const body: unknown = await response.json();
            const data = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
            const code = data.exceptionId ?? data.error_code;
            return { ok: response.ok() && (code === undefined || code === "CBC.0000" || code === "200") && Array.isArray(data.productRatingResult) && data.productRatingResult.length > 0 };
          }
          if (name === "exchange") { const value = await context.catalog.exchangePage(1); return { ok: !!value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).data) }; }
          const response = await http.get(PAGE, { timeout: 20000 }); return { ok: response.ok() };
        }, await auth.status(), () => auth.call("GET", endpoints.list));
      } finally { await http.dispose(); }
    },
    close(): Promise<void> {
      if (closing) return closing;
      closed = true;
      shutdown.abort();
      closing = (async () => {
        const results = await Promise.allSettled([transport?.close(), auth.close(), ...[...temporaryAuth].map(value => value.close())]);
        const failed = results.find(result => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
      })();
      return closing;
    },
  };
}
export { CalculatorError } from "./errors.ts";
