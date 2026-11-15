import { assembleCard } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildNat(input: Extract<CardInput, { service: "nat" }>, context: BuilderContext) {
  const isPrivate = input.nat_type === "private" || input.size.startsWith("privatenat_");
  const cleanSize = input.size.replace(/^(natgateway_|privatenat_)/, "");
  const group = isPrivate ? "natgateway_privatenat" : "natgateway_natgateway";
  const skuSize = isPrivate
    ? (cleanSize === "middle" ? "medium" : cleanSize)
    : (cleanSize === "medium" ? "middle" : cleanSize);
  const specCode = isPrivate ? `privatenat_${skuSize}` : `natgateway_${skuSize}`;
  const p = await selectProduct(context, "nat", input.region, group, specCode, input.billing, input.hours);
  const natTypeToken = String(p.nattype ?? (isPrivate ? "dataInfo_7_" : "dataInfo_5_"));
  const ondemand = input.billing === "ondemand";
  Object.assign(p, { addToList_title: "calc_1_", addToList_product: String(p.type ?? "dataInfo_1_") }, ondemand ? { usageFactor: "duration", usageValue: input.hours, usageMeasureId: 0, usageMeasureName: "", usageMeasurePluralName: "" } : {});
  const card = await assembleCard({ ...input, periods: ondemand ? 1 : input.periods, products: [p], description: "NAT Gateway", rewrite: { calculator_nat_radio: { type: p.type ?? "dataInfo_1_" }, calculator_nat_type: { nattype: natTypeToken } }, includeQuantity: false }, context.rate);
  if (ondemand) (card.rewriteValue.global_ONDEMANDTIME as { UNSET_Stepper_0: { measureId: number } }).UNSET_Stepper_0.measureId = 0;
  return card;
}
