import { assembleCard, stepper } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildCbr(input: Extract<CardInput, { service: "cbr" }>, context: BuilderContext) {
  const p = await selectProduct(context, "cbr", input.region, "cbr_cbr.vault", input.vault_spec, input.billing, input.hours);
  const first = input.vault_spec.includes("database") ? "calc_5_" : "calc_3_";
  Object.assign(p, { resourceSize: input.size_gb, resouceSizeMeasureId: 17, resourceMeasureName: "", resourceMeasurePluralName: "", addToList_title: "calc_1_", addToList_product: `${first} | ${input.size_gb}BSSUNIT.pluralUnit.17` });
  if (input.billing === "ondemand" && !Object.hasOwn(p, "usageFactor")) p.usageFactor = "duration";
  return assembleCard({ ...input, products: [p], description: "Cloud Backup and Recovery", rewrite: { calculator_cbr_type: { UNSET_Stepper_0: stepper(17, input.size_gb), item: first } } }, context.rate);
}
