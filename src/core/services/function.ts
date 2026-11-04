import { assembleCard, productFromCatalog, stepper } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import type { BuilderContext } from "./common.ts";
export async function buildFunction(input: Extract<CardInput, { service: "function" }>, context: BuilderContext) {
  const catalog = await context.productInfo("function", input.region);
  const select = (factor: string) => {
    const raw = catalog.product.functionstage_functionstage?.find(item => Array.isArray(item.planList) && item.planList.some(plan => typeof plan === "object" && plan !== null && (plan as Record<string, unknown>).usageFactor === factor));
    if (!raw) throw new CalculatorError("SPEC_NOT_FOUND", `FunctionGraph ${factor} line not found`);
    return productFromCatalog(raw, "ondemand", input.hours);
  };
  const req = select("request"), compute = select("compute");
  Object.assign(req, { addToList_title: "calc_2_", addToList_product: input.requests / 1000000, usageFactor: "request", usageValue: input.requests / 1000000, usageMeasureId: 32 });
  Object.assign(compute, { addToList_title: "calc_5_", addToList_product: input.gb_seconds, usageFactor: "compute", usageValue: input.gb_seconds, usageMeasureId: 39 });
  return assembleCard({ ...input, periods: 1, products: [req, compute], description: "FunctionGraph", rewrite: { calculator_fgs_compute: String(Math.trunc(input.compute_units)), calculator_fgs_memory: { UNSET_Stepper_0: stepper(11, input.memory_mb) }, calculator_fgs_request: { UNSET_Stepper_0: stepper(20, input.request_units) } }, includeTime: false, includeQuantity: false }, context.rate);
}
