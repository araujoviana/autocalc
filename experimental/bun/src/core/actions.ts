import type { z } from "zod";
import { ListReferenceInput, ListRegionsInput, ListServicesInput, SearchInput, QuoteInput, ConvertInput, CompareRegionsInput, CompareModesInput, EmptyInput, CreateListInput, RenameListInput, DuplicateListInput, LoginInput, DescribeInput } from "./schemas.ts";
import { readPriceList, shareDetail } from "./lists.ts";
import { CalculatorError } from "./errors.ts";
import { RegionResolver } from "./regions.ts";
import { quote, exchangeRates, convertCurrency } from "./pricing.ts";
import { buildCard, supportedServices } from "./services/index.ts";
import { shareLink, vendorServiceCode } from "./endpoints.ts";
import { checkAvailability } from "./availability.ts";
import { roundPython } from "./rounding.ts";
import type { ActionContext } from "./types.ts";

function handler<S extends z.ZodType>(schema: S, fn: (context: ActionContext, input: z.output<S>) => Promise<unknown>) { return fn; }
export function orderObsCards<T>(items: ReadonlyArray<{ service: string; components?: ReadonlyArray<{ factor: string; value: number }> | undefined }>, cards: T[]): T[] {
  const positions = items.flatMap((item, index) => item.service === "obs" ? [index] : []);
  const ranked = positions.map((index, order) => {
    const components = items[index]!.components ?? [];
    const capacity = components.some(component => component.factor.startsWith("size"));
    const download = components.some(component => component.factor.startsWith("download") && component.value > 0);
    return { card: cards[index]!, rank: !capacity ? 0 : download ? 2 : 1, order };
  }).sort((a, b) => a.rank - b.rank || a.order - b.order);
  const result = cards.slice();
  for (const [index, position] of positions.entries()) result[position] = ranked[index]!.card;
  return result;
}
function ensureNotCancelled(context: ActionContext) { if (context.signal?.aborted) throw new CalculatorError("CANCELLED", "Request cancelled"); }
async function runQuote(ctx: ActionContext, input: z.output<typeof QuoteInput>) {
  const menu = await ctx.catalog.menu();
  const region = new RegionResolver(menu.global).resolve(input.region);
  return quote({ ...input, region }, async item => {
    checkAvailability(menu, item.service, region, input.billing);
    if (item.service.toLowerCase() === "obs" && input.billing === "ondemand") {
      if (!item.usage_factor) throw new CalculatorError("VALIDATION", "OBS usage_factor is required to identify the billing line");
      const catalog = await ctx.catalog.productInfo(item.service, region);
      const classToken = item.storage_class ? { standard: "dataInfo_2_", warm: "dataInfo_3_", cold: "dataInfo_1_" }[item.storage_class] : undefined;
      const candidates = Object.values(catalog.product).flat().filter(product => product.resourceSpecCode === item.spec && (!classToken || product.storageType === classToken) && Array.isArray(product.planList) && product.planList.some(plan => typeof plan === "object" && plan !== null && (plan as Record<string, unknown>).usageFactor === item.usage_factor && (plan as Record<string, unknown>).billingMode === "ONDEMAND"));
      if (!candidates.length) throw new CalculatorError("SPEC_NOT_FOUND", `No OBS SKU matches ${item.spec} and usage factor ${item.usage_factor}`);
      if (candidates.length > 1) throw new CalculatorError("VALIDATION", `OBS SKU ${item.spec} and usage factor ${item.usage_factor} are ambiguous`, "Specify storage_class or use a more specific usage factor.");
      const product = candidates[0]!;
      return { cloudServiceType: product.cloudServiceType, resourceType: product.resourceType, description: String(product.productSpecSysDesc ?? ""), usageFactor: item.usage_factor };
    }
    const sku = (await ctx.catalog.skus(item.service, region)).find(product => product.spec === item.spec);
    if (!sku) throw new CalculatorError("SPEC_NOT_FOUND", `Specification ${item.spec} not found`);
    if (input.billing === "ondemand" && !sku.prices.ondemand) throw new CalculatorError("MODE_NOT_OFFERED", `On-demand billing is unavailable for ${item.spec}`);
    return { cloudServiceType: sku.cloudServiceType, resourceType: sku.resourceType, description: sku.description, usageFactor: sku.prices.ondemand?.usage_factor };
  }, ctx.rating);
}
export const handlers = {
  read_price_list: handler(ListReferenceInput, (ctx, input) => readPriceList(ctx.reader, input.url_or_id)),
  list_services: handler(ListServicesInput, async (ctx, input) => (await ctx.catalog.services(input.query)).map(({ service, name, category }) => ({ service, name, category }))),
  list_regions: handler(ListRegionsInput, async (ctx, input) => {
    const names = await ctx.catalog.regions();
    if (input.region) { const id = new RegionResolver(names).resolve(input.region); return { resolved: id, display: names[id] ?? input.region }; }
    if (!input.service) return names;
    const service = (await ctx.catalog.services()).find(item => item.service === vendorServiceCode(input.service));
    return Object.fromEntries((service?.regions ?? []).map(id => [id, names[id] ?? id]));
  }),
  search_skus: handler(SearchInput, async (ctx, input) => {
    const names = await ctx.catalog.regions();
    const region = new RegionResolver(names).resolve(input.region);
    return ctx.catalog.search(input.service, region, input);
  }),
  describe_service: handler(DescribeInput, async (ctx, input) => {
    const menu = await ctx.catalog.menu();
    const region = new RegionResolver(menu.global).resolve(input.region);
    const node = menu.menuInfos?.flatMap(category => category.subCategoryLists).find(service => service.urlPath === vendorServiceCode(input.service));
    if (!node) throw new CalculatorError("SERVICE_NOT_SOLD", `Unknown service ${input.service}`);
    const regionOnline = node.regionOnline ?? {}, entry = regionOnline[region];
    const modes = entry && typeof entry === "object" && Array.isArray((entry as Record<string, unknown>).common) ? (entry as { common: unknown[] }).common : [];
    const catalog = await ctx.catalog.productInfo(input.service, region);
    const groups = Object.fromEntries(Object.entries(catalog.product).map(([name, items]) => [name, { count: items.length, sample_specs: items.map(item => item.resourceSpecCode).filter(Boolean).slice(0, 8) }]));
    return { service: input.service, region, modes_in_region: modes, sold_in_region: (node.regionOnline?.regionList ?? []).includes(region), groups, builders: supportedServices().filter(item => vendorServiceCode(item.service) === vendorServiceCode(input.service)) };
  }),
  quote: handler(QuoteInput, runQuote),
  convert_currency: handler(ConvertInput, async (ctx, input) => convertCurrency(input.amount_usd, input.currency, await exchangeRates(page => ctx.catalog.exchangePage(page)))),
  compare_regions: handler(CompareRegionsInput, async (ctx, input) => {
    const rows = [];
    for (const region of input.regions) {
      ensureNotCancelled(ctx);
      try { const result = await runQuote(ctx, { region, items: input.items, billing: input.mode, periods: 1, hours: 730 }); rows.push({ region: result.region, total_usd: result.total, currency: result.currency }); }
      catch (error) { if (!(error instanceof CalculatorError) || error.code === "CANCELLED") throw error; rows.push({ region, error: error.code, message: error.message, hint: error.hint ?? null }); }
    }
    return { mode: input.mode, regions: rows };
  }),
  compare_modes: handler(CompareModesInput, async (ctx, input) => {
    const region = new RegionResolver(await ctx.catalog.regions()).resolve(input.region);
    const rows: Array<{ mode: string; total_usd?: number; monthly_equivalent_usd?: number; saving_vs_ondemand_pct?: number; error?: string }> = [];
    let base: number | undefined;
    for (const mode of input.modes.length ? input.modes : ["ondemand", "monthly", "yearly"] as const) {
      ensureNotCancelled(ctx);
      try {
        const result = await runQuote(ctx, { region, items: input.items, billing: mode, periods: 1, hours: 730 });
        const monthly = mode === "yearly" ? result.total / 12 : result.total;
        rows.push({ mode, total_usd: result.total, monthly_equivalent_usd: roundPython(monthly, 2) });
        if (mode === "ondemand") base = monthly;
      } catch (error) { if (!(error instanceof CalculatorError) || error.code === "CANCELLED") throw error; rows.push({ mode, error: error.message }); }
    }
    if (base) for (const row of rows) if (row.monthly_equivalent_usd !== undefined) row.saving_vs_ondemand_pct = roundPython((1 - row.monthly_equivalent_usd / base) * 100, 1);
    const currency = input.currency.toUpperCase();
    return currency === "USD" ? { region, modes: rows } : { region, modes: rows, currency, rate: (await exchangeRates(page => ctx.catalog.exchangePage(page)))[currency] ?? null };
  }),
  supported_services: handler(EmptyInput, async () => supportedServices()),
  create_price_list: handler(CreateListInput, async (ctx, input) => {
    const menu = await ctx.catalog.menu();
    const resolver = new RegionResolver(menu.global);
    const cards: Array<Awaited<ReturnType<typeof buildCard>>> = [];
    const warnings: string[] = [];
    for (const [index, item] of input.items.entries()) {
      try {
      const region = resolver.resolve(item.region);
      checkAvailability(menu, item.service, region, item.billing);
      const card = await buildCard({ ...item, region }, { productInfo: (service, region) => ctx.catalog.productInfo(service, region), rate: ctx.rating });
      const products = card.selectedProduct.productAllInfos;
      if (item.service === "ecs" && item.billing === "ri" && Array.isArray(products) && products.some((product: Record<string, unknown>) => product._productType && typeof product.productNum === "number" && product.productNum < item.quantity)) warnings.push("An ECS RI disk quantity is lower than the requested VM quantity; inspect the disk cost.");
      if (item.service === "redis") warnings.push("Redis Edit form fidelity is not yet verified against a saved card.");
      if (item.service === "function") warnings.push("FunctionGraph compute pricing may be unavailable upstream; inspect the compute line.");
      cards.push(card);
      } catch (error) {
        if (!(error instanceof CalculatorError)) throw error;
        throw new CalculatorError(error.code, error.message, error.hint, { ...error.details, index, ...(item.title ? { title: item.title } : {}) });
      }
    }
    const orderedCards = orderObsCards(input.items, cards);
    if (orderedCards.some((card, index) => card !== cards[index])) warnings.push("OBS cards were reordered to reduce calculator Edit state leakage; verify Edit results before relying on the list.");
    if (input.items.some(item => item.service === "obs" && !item.package)) warnings.push("The calculator has a known OBS Edit defect; saved storage capacity can reset when edited. Verify the stored configuration before and after Edit.");
    const totals = { amount: 0, discountAmount: 0, originalAmount: 0, perAmount: 0, monthlyAmount: 0 };
    const summary = orderedCards.map((card, index) => {
      const selected = card.selectedProduct;
      if (typeof selected._customTitle === "string" && selected._customTitle.startsWith("custom.")) selected._customTitle = `custom.${String(selected.serviceCode)} ${index + 1}`;
      for (const key of ["amount", "discountAmount", "originalAmount"] as const) totals[key] = roundPython(totals[key] + (typeof selected[key] === "number" ? selected[key] : 0), 6);
      return { service: selected.serviceCode, title: selected._customTitle, mode: selected.chargeModeName, amount: selected.amount };
    });
    const payload = { billingMode: input.settlement === "monthly" ? "cart.shareList.billingModeMonth" : "cart.shareList.billingModeTotal", cartListData: orderedCards, name: input.name, totalPrice: totals };
    const result = { name: input.name, dry_run: input.dry_run, total_usd: totals.amount, items: summary, warnings, settlement: input.settlement, currency: input.currency };
    if (input.dry_run) return result;
    ensureNotCancelled(ctx);
    const id = await ctx.createList(payload);
    return { ...result, id, url: shareLink(id, input.currency) };
  }),
  list_my_price_lists: handler(EmptyInput, async ctx => (await ctx.lists.lists()).map(raw => { const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}; const id = String(row.key ?? ""); return { name: row.name ?? null, id, url: shareLink(id), total: row.totalPrice ?? null, updated: row.updateTime ?? null }; })),
  delete_price_list: handler(ListReferenceInput, async (ctx, input) => { ensureNotCancelled(ctx); await ctx.lists.delete(input.url_or_id); return { deleted: input.url_or_id }; }),
  rename_price_list: handler(RenameListInput, async (ctx, input) => { const detail = await shareDetail(ctx.reader, input.url_or_id); ensureNotCancelled(ctx); await ctx.lists.update(input.url_or_id, { ...detail, name: input.new_name }); return { id: input.url_or_id, name: input.new_name }; }),
  duplicate_price_list: handler(DuplicateListInput, async (ctx, input) => {
    ensureNotCancelled(ctx);
    const id = await ctx.lists.copy(input.url_or_id);
    if (input.new_name) try { const detail = await shareDetail(ctx.reader, id); ensureNotCancelled(ctx); await ctx.lists.update(id, { ...detail, name: input.new_name }); }
    catch { throw new CalculatorError("UPSTREAM", "List was copied but could not be renamed", "Find the copied list using its ID before retrying.", { created_id: id }); }
    return { id, name: input.new_name ?? null, url: shareLink(id) };
  }),
  auth_status: handler(EmptyInput, async ctx => ctx.auth.status()),
  auth_login: handler(LoginInput, async (ctx, input) => ctx.auth.login(input.timeout, true, ctx.signal)),
} as const;
