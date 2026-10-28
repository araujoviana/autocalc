import { z } from "zod";
import { randomBytes } from "node:crypto";
import { CalculatorError } from "./errors.ts";
import { roundPython } from "./rounding.ts";

const plan = z.looseObject({ billingMode: z.string(), periodNum: z.number().nullable().optional() });
const catalogProduct = z.looseObject({ planList: z.array(plan) });
const planKeys = ["productId", "billingMode", "siteCode", "periodNum", "billingEvent", "measureUnit", "measureUnitStep"] as const;

export function productFromCatalog(raw: unknown, billing: "ondemand" | "monthly" | "yearly", hours: number, matches?: (plan: Record<string, unknown>) => boolean): Record<string, unknown> {
  const parsed = catalogProduct.safeParse(raw);
  if (!parsed.success) throw new CalculatorError("UNEXPECTED_RESPONSE", "Invalid catalog product");
  const copy = structuredClone(parsed.data);
  const plans = copy.planList;
  const result: Record<string, unknown> = copy;
  delete result.planList;
  const wanted = billing === "ondemand" ? ["ONDEMAND"] : ["MONTHLY", "YEARLY"];
  const backup = plans.filter(item => wanted.includes(item.billingMode) && (!matches || matches(item))).map(item => {
    const flattened: Record<string, unknown> = {};
    for (const key of planKeys) flattened[key] = item[key] ?? null;
    if (item.billingMode === "ONDEMAND") { flattened.usageFactor = item.usageFactor ?? null; flattened.usageMeasureId = item.usageMeasureId ?? null; }
    flattened.amount = item.amount ?? null;
    return flattened;
  });
  const chosen = backup.find(item => item.billingMode === billing.toUpperCase() && (item.periodNum === null || item.periodNum === 1));
  if (!chosen) throw new CalculatorError("MODE_NOT_OFFERED", `No ${billing} price for ${String(result.resourceSpecCode ?? "product")}`);
  result.bakPlanList = backup;
  Object.assign(result, chosen);
  if (billing === "ondemand") Object.assign(result, { usageMeasureId: 4, transRate: "", transTarget: "", usageValue: hours, usageMeasureName: "", usageMeasurePluralName: "" });
  return result;
}

export function stepper(measureId: number, value: number, name = "", plural = "") {
  return { measureId, measureValue: value, measureNameBeforeTrans: name, measurePluralNameBeforeTrans: plural, transRate: "", transTarget: "" };
}
export async function assembleCard(input: { service: string; region: string; billing: "ondemand" | "monthly" | "yearly" | "ri"; periods: number; hours: number; quantity: number; products: Record<string, unknown>[]; description: string; rewrite: Record<string, unknown>; title?: string | undefined; buyUrl?: string; includeTime?: boolean; includeQuantity?: boolean; priceFn?: (products: Record<string, unknown>[]) => void }, rate: (body: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  const charges = { ondemand: ["ONDEMAND", "ONDEMAND", 4, 4], monthly: ["PERIOD", "MONTHLY", 2, 20], yearly: ["PERIOD", "YEARLY", 3, 19], ri: ["RI", "RI", 3, 19] } as const;
  const [chargeMode, chargeModeName, periodType, measureId] = charges[input.billing];
  const timeTag = Date.now();
  const products = structuredClone(input.products);
  products.forEach((product, index) => { product.productNum ??= input.quantity; product.inquiryTag ??= "normal"; product.selfProductNum ??= 1; product.selectIndex = index; });
  if (input.priceFn) input.priceFn(products);
  else if (input.billing === "ri") throw new CalculatorError("VALIDATION", "RI cards require an RI pricing function");
  else await rateProducts(products, input.region, input.billing, input.periods, timeTag, rate);
  const selected: Record<string, unknown> = { region: input.region, locationType: "commonAZ", chargeMode, tag: "general.online.portal", serviceCode: input.service, timeTag, chargeModeName, periodType, periodNum: input.billing === "ondemand" ? 1 : input.periods, subscriptionNum: 1, description: input.description, productAllInfos: products };
  const includeTime = input.includeTime ?? true, includeQuantity = input.includeQuantity ?? true;
  if (includeTime) selected.purchaseTime = { measureValue: input.billing === "ondemand" ? input.hours : input.periods, measureId, measureNameBeforeTrans: "", measurePluralNameBeforeTrans: "" };
  if (includeQuantity) selected.purchaseNum = { measureValue: input.quantity, measureId: 41, measureNameBeforeTrans: "calc_29_", measurePluralNameBeforeTrans: "calc_30_" };
  for (const key of ["amount", "discountAmount", "originalAmount", "perAmount", "installAmount", "perDiscountAmount", "perOriginalAmount"]) {
    const values = products.map(p => (p.inquiryResult as Record<string, unknown> | undefined)?.[key]);
    if (key.startsWith("per") || key === "installAmount") { if (values.every(v => v === null || v === undefined)) continue; }
    selected[key] = roundPython(values.reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0), 6);
  }
  selected._cartId = randomBytes(16).toString("hex").toUpperCase();
  selected._customTitle = input.title ?? `custom.${input.service} 1`;
  const rewrite: Record<string, unknown> = { global_TITLE: { tag: "general.online.portal" }, global_DESCRIPTION: input.description, global_REGIONINFO: { region: input.region, locationType: "commonAZ", chargeMode }, template_RENDER: input.rewrite };
  if (includeTime) {
    if (input.billing === "ondemand") rewrite.global_ONDEMANDTIME = { UNSET_Stepper_0: stepper(4, input.hours) };
    else rewrite.global_PERIODTIME = { UNSET_PeriodTime: { measureValue: input.periods, measureId } };
  }
  if (includeQuantity) rewrite.global_QUANTITY = { UNSET_Stepper_0: stepper(41, input.quantity, "calc_29_", "calc_30_") };
  return { buyUrl: input.buyUrl ?? "", rewriteValue: rewrite, selectedProduct: selected };
}

export async function rateProducts(products: Record<string, unknown>[], region: string, billing: "ondemand" | "monthly" | "yearly", periods: number, timeTag: number, rate: (body: Record<string, unknown>) => Promise<Record<string, unknown>>): Promise<void> {
  const modes = { ondemand: [1, 4], monthly: [0, 2], yearly: [0, 3] } as const;
  const [chargingMode, periodType] = modes[billing];
  const infos: Record<string, unknown>[] = [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const p of products) {
    const id = `${timeTag}-${String(p.selectIndex)}-${String(p.productId)}`;
    if (p.inquiryTag !== "normal") {
      p.inquiryResult = { amount: 0, originalAmount: 0, discountAmount: 0, productId: "noId", id: `${timeTag}-${String(p.selectIndex)}-noId` };
      continue;
    }
    const row: Record<string, unknown> = { id, cloudServiceType: p.cloudServiceType, resourceType: p.resourceType, resourceSpecCode: p.resourceSpecCode, productNum: p.productNum };
    if (p.resourceSize !== undefined && p.resourceSize !== null) Object.assign(row, { resourceSize: p.resourceSize, resouceSizeMeasureId: p.resouceSizeMeasureId ?? 17 });
    if (billing === "ondemand") Object.assign(row, { usageFactor: p.usageFactor, usageMeasureId: p.usageMeasureId, usageValue: p.usageValue });
    infos.push(row); byId.set(id, p);
  }
  const result = await rate({ regionId: region, chargingMode, periodType, periodNum: billing === "ondemand" ? 1 : periods, subscriptionNum: 1, siteCode: "HWC", productInfos: infos });
  const parsed = z.array(z.looseObject({ id: z.string(), amount: z.number().finite() })).safeParse(result.productRatingResult);
  if (!parsed.success || parsed.data.length !== infos.length) throw new CalculatorError("UNEXPECTED_RESPONSE", "Invalid product rating response");
  const seen = new Set<string>();
  for (const row of parsed.data) {
    const p = byId.get(row.id);
    if (!p || seen.has(row.id)) throw new CalculatorError("UNEXPECTED_RESPONSE", "Unexpected product rating ID");
    seen.add(row.id);
    p.inquiryResult = { id: row.id, productId: row.productId ?? null, amount: row.amount, discountAmount: row.discountAmount ?? 0, originalAmount: row.originalAmount ?? row.amount,
      perAmount: row.perAmount ?? null, perDiscountAmount: row.perDiscountAmount ?? null, perOriginalAmount: row.perOriginalAmount ?? null, perPeriodType: row.perPeriodType ?? null, measureId: row.measureId ?? 1, extendParams: row.extendParams ?? null };
  }
}
