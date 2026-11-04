import { CalculatorError, mapUpstreamError } from "./errors.ts";
import { z } from "zod";
import type { QuoteInput } from "./schemas.ts";
import { roundPython } from "./rounding.ts";
import { obsUsageMeasure } from "./services/obs.ts";

type RatingResponse = { status: number; body: unknown };
type PostRating = (body: Record<string, unknown>, signal?: AbortSignal) => Promise<RatingResponse>;
export function abortable<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation();
  if (signal.aborted) return Promise.reject(new CalculatorError("CANCELLED", "Request cancelled"));
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(new CalculatorError("CANCELLED", "Request cancelled")); };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { if (signal.aborted) throw new CalculatorError("CANCELLED", "Request cancelled"); return operation(); }).then(
      value => { signal.removeEventListener("abort", abort); resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); },
    );
    if (signal.aborted) abort();
  });
}
const pause = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new CalculatorError("CANCELLED", "Request cancelled")); return; }
  const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, milliseconds);
  const abort = () => { clearTimeout(timer); reject(new CalculatorError("CANCELLED", "Request cancelled")); };
  signal?.addEventListener("abort", abort, { once: true });
});
export async function inquiry(post: PostRating, body: Record<string, unknown>, options: { signal?: AbortSignal; wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void> } = {}): Promise<Record<string, unknown>> {
  const wait = options.wait ?? pause;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (options.signal?.aborted) throw new CalculatorError("CANCELLED", "Request cancelled");
    let response: RatingResponse;
    try { response = await abortable(() => post(body, options.signal), options.signal); }
    catch {
      if (options.signal?.aborted) throw new CalculatorError("CANCELLED", "Request cancelled");
      if (attempt === 2) throw new CalculatorError("UPSTREAM", "Rating request failed");
      await wait(500 * (attempt + 1), options.signal);
      continue;
    }
    if (response.status >= 500 && attempt < 2) { await wait(500 * (attempt + 1), options.signal); continue; }
    if (response.body === null || typeof response.body !== "object" || Array.isArray(response.body)) throw new CalculatorError("UNEXPECTED_RESPONSE", `Rating returned invalid JSON (HTTP ${response.status})`);
    const result = response.body as Record<string, unknown>;
    const exceptionId = result.exceptionId ?? result.error_code;
    if (typeof exceptionId === "string" && !["CBC.0000", "200"].includes(exceptionId)) throw mapUpstreamError(exceptionId);
    if (response.status !== 200) throw new CalculatorError("UPSTREAM", `Rating request failed with HTTP ${response.status}`);
    return result;
  }
  throw new CalculatorError("UPSTREAM", "Rating request failed");
}

export async function quote(input: z.output<typeof QuoteInput>, findSku: (item: z.output<typeof QuoteInput>["items"][number]) => Promise<{ cloudServiceType: unknown; resourceType: unknown; description: string; usageFactor?: unknown }>, rate: (body: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  const modes = { ondemand: [1, 4], monthly: [0, 2], yearly: [0, 3] } as const;
  const [chargingMode, periodType] = modes[input.billing];
  const infos: Record<string, unknown>[] = [];
  const metadata = new Map<string, { service: string; spec: string; description: string; quantity: number; size: number | null; scale: number }>();
  for (const [index, item] of input.items.entries()) {
    const sku = await findSku(item), id = `item${index}`;
    const product: Record<string, unknown> = { id, cloudServiceType: sku.cloudServiceType, resourceType: sku.resourceType, resourceSpecCode: item.spec, productNum: item.quantity };
    if (item.size !== undefined) Object.assign(product, { resourceSize: item.size, resouceSizeMeasureId: item.size_measure_id ?? 17 });
    let scale = 1;
    if (input.billing === "ondemand") {
      const factor = item.usage_factor ?? (typeof sku.usageFactor === "string" ? sku.usageFactor : "Duration");
      if (factor === "Duration") { Object.assign(product, { usageFactor: factor, usageMeasureId: 4, usageValue: 1 }); scale = input.hours; }
      else {
        if (item.usage_value === undefined) throw new CalculatorError("VALIDATION", `${item.spec} requires usage_value for ${factor}`);
        const obsSize = item.service.toLowerCase() === "obs" && factor.startsWith("size");
        const measure = item.usage_measure_id ?? (item.service.toLowerCase() === "obs" ? obsUsageMeasure(factor) : 17);
        if (measure === undefined) throw new CalculatorError("VALIDATION", `Specify usage_measure_id for OBS factor ${factor}`);
        Object.assign(product, { usageFactor: factor, usageValue: item.usage_value, usageMeasureId: measure });
        if (obsSize) scale = 720;
        else if (factor.startsWith("size")) scale = input.hours;
      }
    }
    infos.push(product); metadata.set(id, { service: item.service, spec: item.spec, description: sku.description, quantity: item.quantity, size: item.size ?? null, scale });
  }
  const response = await rate({ regionId: input.region, chargingMode, periodType, periodNum: input.billing === "ondemand" ? 1 : input.periods, subscriptionNum: 1, siteCode: "HWC", productInfos: infos });
  const parsed = z.array(z.looseObject({ id: z.string(), amount: z.number().finite(), originalAmount: z.number().finite().nullish() })).safeParse(response.productRatingResult);
  if (!parsed.success || parsed.data.length !== infos.length) throw new CalculatorError("UNEXPECTED_RESPONSE", "Invalid quote rating response");
  let total = 0, original = 0; const seen = new Set<string>();
  const lines = parsed.data.map(row => {
    const meta = metadata.get(row.id);
    if (!meta || seen.has(row.id)) throw new CalculatorError("UNEXPECTED_RESPONSE", "Unexpected quote rating ID");
    seen.add(row.id); const amount = row.amount * meta.scale, listPrice = (row.originalAmount ?? row.amount) * meta.scale;
    total += amount; original += listPrice;
    return { service: meta.service, spec: meta.spec, description: meta.description, quantity: meta.quantity, size: meta.size, amount: roundPython(amount, 4), list_price: roundPython(listPrice, 4) };
  });
  return { region: input.region, billing: input.billing, term: input.billing === "ondemand" ? `${input.hours} hours` : `${input.periods} ${input.billing === "monthly" ? "month" : "year"}(s)`, currency: typeof response.currency === "string" ? response.currency : "USD", total: roundPython(total, 4), list_price: roundPython(original, 4), discount: roundPython(original - total, 4), items: lines };
}

export async function exchangeRates(fetchPage: (page: number) => Promise<unknown>): Promise<Record<string, number>> {
  const response = z.looseObject({ data: z.array(z.looseObject({ baseCurrency: z.string(), currency: z.string(), rate: z.number().finite() })).nullish(), totalSize: z.coerce.number().optional() });
  const rates: Record<string, number> = {};
  for (let page = 1; page <= 21; page++) {
    const parsed = response.safeParse(await fetchPage(page));
    if (!parsed.success) throw new CalculatorError("UNEXPECTED_RESPONSE", "Invalid exchange-rate response");
    const rows = parsed.data.data ?? [];
    for (const row of rows) if (row.baseCurrency === "USD") rates[row.currency] = row.rate;
    if (!rows.length || Object.keys(rates).length >= (parsed.data.totalSize ?? 0)) break;
  }
  return rates;
}
export function convertCurrency(amount: number, currency: string, rates: Record<string, number>) {
  const rate = rates[currency.toUpperCase()];
  if (rate === undefined) return { error: `no rate for ${currency}`, available: Object.keys(rates).sort() };
  return { usd: amount, currency: currency.toUpperCase(), rate, amount: roundPython(amount * rate, 2) };
}
