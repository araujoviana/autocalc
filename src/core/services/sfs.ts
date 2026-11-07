import { assembleCard } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
import { roundPython } from "../rounding.ts";
import { CalculatorError } from "../errors.ts";
export async function buildSfs(input: Extract<CardInput, { service: "sfsturbo" }>, context: BuilderContext) {
  const spec = input.tier.startsWith("sfs.turbo") ? input.tier : `sfs.turbo.${input.tier}`;
  const p = await selectProduct(context, "sfsturbo", input.region, "sfsturbo_sfsturbo", spec, input.billing, input.hours);
  if (input.billing === "ondemand" && input.quantity !== 1) throw new CalculatorError("VALIDATION", "SFS Turbo pay-per-use has no quantity control; use one card per file system");
  const tb = roundPython(input.size_gb / 1024, 1), minTb = spec === "sfs.turbo.20MBps" ? 3.6 : 1.2;
  if (tb < minTb) throw new CalculatorError("VALIDATION", `SFS Turbo ${input.tier} needs at least ${minTb} TB (${Math.ceil(minTb * 1024)} GB)`);
  Object.assign(p, { resourceSize: input.size_gb, resouceSizeMeasureId: 17, resourceMeasureName: "", resourceMeasurePluralName: "", cpqPurchaseCapacity: input.size_gb, cpqPurchaseQuantity: input.quantity, addToList_title: "calc_18_", addToList_product: `${String(p.fileType ?? "None")} | ${String(p.sellingStatus ?? "None")} | ${String(p.sfsTypeList ?? "None")} | ${tb}BSSUNIT.unit.47` });
  if (input.billing === "ondemand") Object.assign(p, { usageValue: 1, productNum: Math.trunc(input.hours) }); // the page counts hours as the product number
  const card = await assembleCard({ ...input, products: [p], description: "Scalable File Service Turbo", rewrite: { calculator_sfsType_radio: { fileType: p.fileType ?? null, sellingStatus: p.sellingStatus ?? null, sfsType: p.sfsType ?? null }, [spec === "sfs.turbo.20MBps" ? "calculator_sfsPeriod_36input" : "calculator_sfsPeriod_12input"]: tb }, includeQuantity: input.billing !== "ondemand" }, context.rate);
  const quantity = card.rewriteValue.global_QUANTITY as { UNSET_Stepper_0: { measureNameBeforeTrans: string; measurePluralNameBeforeTrans: string } } | undefined;
  if (quantity) { quantity.UNSET_Stepper_0.measureNameBeforeTrans = ""; quantity.UNSET_Stepper_0.measurePluralNameBeforeTrans = ""; }
  return card;
}
