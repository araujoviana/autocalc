import { assembleCard, stepper } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildApm(input: Extract<CardInput, { service: "apm" }>, context: BuilderContext) {
  const p = await selectProduct(context, "apm", input.region, "apm_apm2.instance", input.spec, input.billing, input.hours);
  Object.assign(p, { addToList_title: "the pricing unit of APM 2.0 Ondemand", addToList_product: "detail_51_：1", usageFactor: "apm2.instance", usageValue: 1, usageMeasureId: 30, durationNum: input.hours, productNum: input.hours });
  return assembleCard({ ...input, periods: 1, products: [p], description: "Application Performance Management", rewrite: { calculator_apm2Number_stepper: { UNSET_Stepper_0: stepper(30, 1, "detail_59_", "detail_59_") } }, includeQuantity: false }, context.rate);
}
