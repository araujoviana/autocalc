import { assembleCard, productFromCatalog } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";

type ApigInput = Extract<CardInput, { service: "apig" }>;
interface BuilderContext {
  productInfo(service: string, region: string): Promise<{ product: Record<string, Record<string, unknown>[]> }>;
  rate(body: Record<string, unknown>): Promise<Record<string, unknown>>;
}
export async function buildApig(input: ApigInput, context: BuilderContext) {
  const catalog = await context.productInfo("apig", input.region);
  const item = catalog.product["apig_apig.instance"]?.find(product => product.resourceSpecCode === input.edition);
  if (!item) throw new CalculatorError("SPEC_NOT_FOUND", `API Gateway edition ${input.edition} not found`);
  const product = productFromCatalog(item, input.billing, input.hours);
  Object.assign(product, { addToList_title: "calc_1_", addToList_product: "dataInfo_1_" });
  return assembleCard({ service: "apig", region: input.region, billing: input.billing, periods: input.periods, hours: input.hours, quantity: input.quantity, products: [product], description: "API Gateway", rewrite: { calculator_spec_radioGroups: { type: "dataInfo_1_" }, calculator_bandwidth_switch: { UNSET_Switch: "dataInfo_6_" } }, includeQuantity: false, ...(input.title === undefined ? {} : { title: input.title }) }, context.rate);
}
