import { assembleCard } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildDline(input: Extract<CardInput, { service: "dline" }>, context: BuilderContext) {
  const p = await selectProduct(context, "dline", input.region, "dcaas_dcaas.port", input.port, input.billing, input.hours);
  Object.assign(p, { addToList_title: "calc_1_", addToList_product: "dataInfo_1_" });
  return assembleCard({ ...input, products: [p], description: "Cloud Connect / Direct Connect As A Service", rewrite: { calculator_dline_radio: { portType: "dataInfo_1_" } } }, context.rate);
}
