import { assembleCard, productFromCatalog, stepper } from "../cards.ts";
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
  const typeToken = String(item.type ?? "dataInfo_1_");
  const product = productFromCatalog(item, input.billing, input.hours);
  Object.assign(product, { addToList_title: "calc_1_", addToList_product: typeToken });
  const products: Record<string, unknown>[] = [product];
  const bw = input.bandwidth_mbps ?? 0;
  const rewrite: Record<string, unknown> = {
    calculator_spec_radioGroups: { type: typeToken },
    calculator_bandwidth_switch: { UNSET_Switch: bw > 0 ? "dataInfo_5_" : "dataInfo_6_" },
  };
  if (bw > 0) {
    const bwItem = catalog.product["apig_apig.publicip"]?.find(p => p.resourceSpecCode === "publicip");
    if (!bwItem) throw new CalculatorError("SPEC_NOT_FOUND", "API Gateway public outbound bandwidth SKU 'publicip' not found");
    const bwProd = productFromCatalog(bwItem, input.billing, input.hours);
    Object.assign(bwProd, {
      resourceSize: bw,
      resouceSizeMeasureId: 15,
      resourceMeasureName: "",
      resourceMeasurePluralName: "",
      addToList_title: "calc_2_",
      addToList_product: `${bw}BSSUNIT.${bw > 1 ? "pluralUnit" : "unit"}.15`,
    });
    products.push(bwProd);
    rewrite.calculator_bandwidth_stepper = { UNSET_Stepper_0: stepper(15, bw) };
  }
  return assembleCard({ service: "apig", region: input.region, billing: input.billing, periods: input.periods, hours: input.hours, quantity: input.quantity, products, description: "API Gateway", rewrite, includeQuantity: false, ...(input.title === undefined ? {} : { title: input.title }) }, context.rate);
}
