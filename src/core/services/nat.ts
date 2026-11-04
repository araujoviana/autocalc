import { assembleCard } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildNat(input: Extract<CardInput, { service: "nat" }>, context: BuilderContext) {
  const p = await selectProduct(context, "nat", input.region, "natgateway_natgateway", `natgateway_${input.size}`, input.billing, input.hours);
  Object.assign(p, { addToList_title: "calc_1_", addToList_product: "dataInfo_1_", usageFactor: "duration", usageValue: input.hours, usageMeasureId: 0, usageMeasureName: "", usageMeasurePluralName: "" });
  const card = await assembleCard({ ...input, periods: 1, products: [p], description: "NAT Gateway", rewrite: { calculator_nat_radio: { type: "dataInfo_1_" }, calculator_nat_type: { nattype: "dataInfo_5_" } }, includeQuantity: false }, context.rate);
  const time = card.rewriteValue.global_ONDEMANDTIME as { UNSET_Stepper_0: { measureId: number } };
  time.UNSET_Stepper_0.measureId = 0;
  return card;
}
