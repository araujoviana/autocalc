import { assembleCard } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildCce(input: Extract<CardInput, { service: "cce" }>, context: BuilderContext) {
  if (input.cluster_type !== "standard") throw new CalculatorError("VALIDATION", "Only standard CCE clusters have a verified form mapping.");
  if (!["small", "medium", "large", "xlarge"].includes(input.scale)) throw new CalculatorError("VALIDATION", `Unknown CCE scale ${input.scale}`);
  const series = input.ha ? "s2" : "s1";
  const p = await selectProduct(context, "cce", input.region, "cce_cce.cluster", `cce.${series}.${input.scale}`, input.billing, input.hours);
  if (input.billing === "ondemand" && !Object.hasOwn(p, "usageFactor")) p.usageFactor = "duration";
  const keys = ["productType", "clusterType", "clusterNodeScale", "clusterMasterScale"];
  Object.assign(p, { addToList_title: "dataInfo_15_", addToList_product: keys.map(key => String(p[key] ?? "None")).join(" | ") });
  const render = Object.fromEntries(keys.map(key => [key, p[key] ?? null]));
  const card = await assembleCard({ ...input, products: [p], description: "Cloud Container Engine", rewrite: { calculator_clustertype_radio: render }, includeQuantity: input.billing !== "ondemand" }, context.rate);
  const quantity = card.rewriteValue.global_QUANTITY as { UNSET_Stepper_0: { measureNameBeforeTrans: string; measurePluralNameBeforeTrans: string } } | undefined;
  if (quantity) {
    quantity.UNSET_Stepper_0.measureNameBeforeTrans = ""; quantity.UNSET_Stepper_0.measurePluralNameBeforeTrans = "";
  }
  if (card.selectedProduct.purchaseNum) {
    Object.assign(card.selectedProduct.purchaseNum as Record<string, unknown>, { measureNameBeforeTrans: "", measurePluralNameBeforeTrans: "" });
  }
  return card;
}
