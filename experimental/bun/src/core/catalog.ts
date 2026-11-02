import { z } from "zod";
import { endpoints, vendorServiceCode } from "./endpoints.ts";
import { CalculatorError } from "./errors.ts";

const vendorObject = z.looseObject({});
const productSchema = z.looseObject({ product: z.record(z.string(), z.array(vendorObject)) });
const menuSchema = z.looseObject({ global: z.record(z.string(), z.string()), regionsOfSite: z.looseObject({ HWC: z.array(z.string()) }).optional(), menuInfos: z.array(z.looseObject({ parentCategoryName: z.string(), subCategoryLists: z.array(z.looseObject({ urlPath: z.string(), categoryName: z.string(), hasCalculator: z.boolean().optional(), hideCalculator: z.boolean().optional(), regionOnline: z.looseObject({ regionList: z.array(z.string()).optional() }).nullable().optional() })) })).optional() });
const asObject = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asString = (value: unknown): string => typeof value === "string" ? value : "";
interface PublicReader { get(url: string, options?: { mirror?: string; refresh?: boolean }): Promise<unknown> }
export class Catalog {
  constructor(private readonly transport: PublicReader) {}
  async menu(language = "en-us", refresh = false): Promise<z.output<typeof menuSchema>> {
    const value = await this.transport.get(endpoints.menu(language), { mirror: endpoints.cdnMenu(language), refresh });
    const parsed = menuSchema.safeParse(value);
    if (!parsed.success) throw new CalculatorError("UNEXPECTED_RESPONSE", "Invalid calculator menu");
    return parsed.data;
  }
  async labels(language = "en-us", refresh = false): Promise<Record<string, unknown>> {
    const value = await this.transport.get(endpoints.labels(language), { refresh });
    const parsed = vendorObject.safeParse(value);
    if (!parsed.success) throw new CalculatorError("UNEXPECTED_RESPONSE", "Invalid calculator labels");
    return parsed.data;
  }
  async services(query = "") {
    const menu = await this.menu();
    if (!menu.menuInfos) throw new CalculatorError("UNEXPECTED_RESPONSE", "Calculator menu has no services");
    return menu.menuInfos.flatMap(category => category.subCategoryLists.filter(service => service.hasCalculator && !service.hideCalculator).map(service => ({ service: service.urlPath, name: service.categoryName, category: category.parentCategoryName, regions: service.regionOnline?.regionList ?? [] })))
      .filter(service => `${service.service} ${service.name} ${service.category}`.toLowerCase().includes(query.toLowerCase()));
  }
  async regions(): Promise<Record<string, string>> {
    const menu = await this.menu();
    if (!menu.regionsOfSite) throw new CalculatorError("UNEXPECTED_RESPONSE", "Calculator menu has no site regions");
    return Object.fromEntries(menu.regionsOfSite.HWC.map(id => [id, menu.global[id] ?? id]));
  }
  async exchangePage(page: number): Promise<unknown> { return this.transport.get(endpoints.exchangeRates(page)); }
  async skus(service: string, region: string, refresh = false) {
    const [catalog, rawLabels, menu] = await Promise.all([this.productInfo(service, region, refresh), this.labels("en-us", refresh), this.menu("en-us", refresh)]);
    const labels = asObject(rawLabels[vendorServiceCode(service)]), units = asObject(menu.measureID);
    const resolve = (value: unknown) => asString(value).replace(/\b((?:dataInfo|calc|detail)_\d+_)/g, token => typeof labels[token] === "string" ? labels[token] as string : token).replace(/BSSUNIT\.(plural)?[uU]nit\.(\d+)/g, (_match, plural: string | undefined, id: string) => ` ${asString(asObject(units[id])[plural ? "pluralUnit" : "unit"])}`).trim();
    return Object.entries(catalog.product).flatMap(([group, items]) => items.map(item => {
      const prices: Record<string, { amount: number; currency: string; per: string; usage_factor?: unknown }> = {};
      for (const raw of Array.isArray(item.planList) ? item.planList : []) {
        const plan = asObject(raw), mode = asString(plan.billingMode).toLowerCase();
        if (plan.planType !== "PRICEPLAN" || typeof plan.amount !== "number" || !Number.isFinite(plan.amount) || !mode || prices[mode]) continue;
        const onetime = asString(plan.billingEvent).endsWith("onetime");
        const unit = asObject(units[String(plan.measureUnit)]);
        const per = onetime ? `${String(plan.periodNum || 1)} ${mode === "monthly" ? "month" : "year"}` : `${String(plan.measureUnitStep || 1)} ${asString(unit.unit) || String(plan.measureUnit ?? "")}`;
        prices[mode] = { amount: plan.amount, currency: "USD", per, ...(onetime ? {} : { usage_factor: plan.usageFactor }) };
      }
      return { service, group, spec: asString(item.resourceSpecCode), description: resolve(item.productSpecSysDesc), prices, cloudServiceType: item.cloudServiceType, resourceType: item.resourceType };
    }));
  }
  async search(service: string, region: string, options: { query?: string; billing?: string | undefined; min_vcpus?: number | undefined; min_memory_gb?: number | undefined; limit?: number; refresh?: boolean } = {}) {
    const skus = await this.skus(service, region, options.refresh);
    const terms = (options.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    return skus.filter(sku => {
      const haystack = `${sku.group} ${sku.spec} ${sku.description}`.toLowerCase();
      if (!terms.every(term => haystack.includes(term)) || (options.billing && !sku.prices[options.billing])) return false;
      const cpu = /vCPUs:\s*([\d.]+)/.exec(sku.description), memory = /Memory:\s*([\d.]+)\s*MB/.exec(sku.description);
      return (options.min_vcpus === undefined || (!!cpu && Number(cpu[1]) >= options.min_vcpus)) && (options.min_memory_gb === undefined || (!!memory && Number(memory[1]) / 1024 >= options.min_memory_gb));
    }).sort((a, b) => (a.prices[options.billing ?? "ondemand"]?.amount ?? Infinity) - (b.prices[options.billing ?? "ondemand"]?.amount ?? Infinity)).slice(0, options.limit ?? 30).map(({ cloudServiceType: _cloudServiceType, resourceType: _resourceType, ...sku }) => sku);
  }
  async productInfo(service: string, region: string, refresh = false): Promise<z.output<typeof productSchema>> {
    service = vendorServiceCode(service);
    const value = await this.transport.get(endpoints.product(service, region), { mirror: endpoints.cdnProduct(service, region), refresh });
    const parsed = productSchema.safeParse(value);
    if (!parsed.success) throw new CalculatorError("UNEXPECTED_RESPONSE", "Invalid calculator product catalog");
    return parsed.data;
  }
}
