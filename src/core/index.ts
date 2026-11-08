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
import { ListSession, shareDetail } from "./lists.ts";
import { profilePaths, resolveConfig } from "./config.ts";
import { validateList } from "./validate.ts";
import { BrowserManager, discoverBrowserExecutable } from "./browser.ts";
import { renderCheck } from "./page.ts";
import { doctor } from "./diagnostics.ts";
import { request } from "playwright";
import { HuaweiProvider } from "../providers/huawei.ts";
import { DraftStore } from "./quote/store.ts";
import { checkAvailability } from "./availability.ts";
import { mkdir } from "node:fs/promises";
import { inFormOnlyMode } from "./cards.ts";
import { buildRecipe, RECIPES } from "./services/forms.ts";
import { buildCard as buildServiceCard } from "./services/index.ts";
import { encodeCard } from "./page/encode.ts";
import { editCheck } from "./page/edit.ts";
import { formatCents } from "./quote/decimal.ts";
import { roundPython } from "./rounding.ts";
import { publishChecked, verify } from "./gate.ts";
import type { PublishPorts } from "./publish.ts";
import { liveVersion, warnings as frontendWarnings } from "./frontend.ts";
import { VERIFIED } from "./services/publication.ts";
import { staleNotes } from "./schema-model.ts";

export function createCore(options: { reader?: ActionContext["reader"]; catalogReader?: ConstructorParameters<typeof Catalog>[0]; rating?: ActionContext["rating"]; listSession?: ActionContext["lists"]; cacheDir?: string; profile?: string; headed?: boolean } = {}) {
  const cacheDir = options.cacheDir ?? process.env.AUTOCALC_CACHE ?? join(homedir(), ".cache", "autocalc");
  const transport = options.reader && options.catalogReader && options.rating ? undefined : new PublicTransport(new CatalogCache(cacheDir));
  const config = resolveConfig({ ...(options.profile ? { profile: options.profile } : {}), ...(options.headed === undefined ? {} : { headed: options.headed }) });
  const paths = profilePaths(config.profile!);
  const browser = new BrowserManager({ profilePath: paths.profileDir, headed: config.headed, ...(config.executable ? { executable: config.executable } : {}) });
  const auth = new AuthManager({ profile: config.profile!, ...paths, headed: config.headed, browser, ...(config.executable ? { executable: config.executable } : {}) });
  const lists = options.listSession ?? new ListSession((method, url, body) => auth.call(method, url, body), () => auth.refresh());
  const catalog = new Catalog(options.catalogReader ?? transport!);
  const provider = new HuaweiProvider({ skus: (service, region) => catalog.skus(service, region), checkMode: async (service, region, billing) => checkAvailability(await catalog.menu(), service, region, billing as "ondemand" | "monthly" | "yearly") });
  const rating: ActionContext["rating"] = options.rating ?? (body => inquiry(value => transport!.post(RATE, value), body));
  const reader = options.reader ?? transport!;
  const publish: PublishPorts = {
    form: async input => String(input.service) in RECIPES
      ? buildRecipe(String(input.service), input as never).rewriteValue
      : (await inFormOnlyMode(() => buildServiceCard(input as never, { productInfo: (service, region) => catalog.productInfo(service, region), rate: async () => { throw new CalculatorError("AUTOCALC", "A form-only build must not rate."); } }))).rewriteValue as Record<string, unknown>,
    encode: (service, rewriteValue) => encodeCard(browser, service, rewriteValue),
    publish: (name, cards, publishOptions) => publishChecked(name, cards, { ...publishOptions, lists, check: (listId, expected) => verify(listId, { reader, rate: rating, edit: id => editCheck(reader, browser, id) }, expected) }),
    liveVersion: () => liveVersion(),
  };
  const context: ActionContext = { publish, provider, drafts: new DraftStore(), reader: options.reader ?? transport!, catalog, rating: options.rating ?? (body => inquiry(value => transport!.post(RATE, value), body)), lists, auth };
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
    async logout() { ensureOpen(); return auth.logout(); },
    async validate(reference: string) { ensureOpen(); return validateList(await shareDetail(context.reader, reference)); },
    async renderCheck(reference: string) { ensureOpen(); return renderCheck(browser, reference); },
    async editCheck(reference: string, limit?: number) {
      ensureOpen();
      const cards = (await shareDetail(context.reader, reference)).cartListData;
      const checked = await editCheck(context.reader, browser, reference);
      const results = checked.slice(0, limit ?? checked.length).map(result => {
        const selected = (cards[result.index]?.selectedProduct ?? {}) as Record<string, unknown>;
        const stored = Number(formatCents(result.stored)), edit = result.edit === null ? null : Number(formatCents(result.edit));
        return { index: result.index, title: String(selected._customTitle ?? selected.serviceCode ?? `card ${result.index}`), status: result.equal ? "ok" as const : edit === null ? "unavailable" as const : "mismatch" as const, stored, edit, delta: edit === null ? null : roundPython(edit - stored, 6), added: [], removed: [], reason: result.reason ?? "" };
      });
      return { ok: results.length > 0 && results.every(result => result.status === "ok"), results };
    },
    async doctor() {
      ensureOpen();
      const http = await request.newContext({ timeout: 15000 });
      try {
        let live: string | undefined;
        const diag = await doctor(async name => {
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
          live = await liveVersion();
          return { ok: Boolean(live) };
        }, await auth.status());
        const notes = [...frontendWarnings([...VERIFIED].sort(), live), ...(await staleNotes(live))];
        const executable = discoverBrowserExecutable(config.executable);
        await mkdir(cacheDir, { recursive: true });
        return {
          ...diag,
          frontend: { version: live ?? null, warnings: notes },
          browser: executable ?? "bundled (playwright build)",
          profile_dir: paths.profileDir,
          cache_dir: cacheDir,
        };
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
export { CalculatorError, normalizeError } from "./errors.ts";
