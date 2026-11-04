import { productFromCatalog } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
export interface BuilderContext {
  productInfo(service: string, region: string): Promise<{ product: Record<string, Record<string, unknown>[]> }>;
  rate(body: Record<string, unknown>): Promise<Record<string, unknown>>;
}
export async function selectProduct(context: BuilderContext, service: string, region: string, group: string, spec: string, billing: "ondemand" | "monthly" | "yearly", hours: number, matches?: (plan: Record<string, unknown>) => boolean) {
  const catalog = await context.productInfo(service, region);
  const item = catalog.product[group]?.find(product => product.resourceSpecCode === spec);
  if (!item) {
    const base = spec.split(".")[0]!.split("-")[0]!;
    const nearest = (catalog.product[group] ?? []).map(product => typeof product.resourceSpecCode === "string" ? product.resourceSpecCode : "").sort((a, b) =>
      Number(!a.startsWith(base)) - Number(!b.startsWith(base)) || Number(!a.includes(base)) - Number(!b.includes(base)) || Math.abs(a.length - spec.length) - Math.abs(b.length - spec.length) || (a < b ? -1 : a > b ? 1 : 0)).slice(0, 5).filter(Boolean);
    throw new CalculatorError("SPEC_NOT_FOUND", `${spec} not sold in ${region} for ${service} (${group})`, nearest.length ? `Closest specs: ${nearest.join(", ")}` : undefined, { spec, region, group, nearest });
  }
  return productFromCatalog(item, billing, hours, matches);
}
