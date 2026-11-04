import { assembleCard, stepper } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildWaf(input: Extract<CardInput, { service: "waf" }>, context: BuilderContext) {
  const entries = [["waf_waf.payperusedomain", "waf.payperuse.domain", "calc_10_", input.domains, Math.trunc(input.domains), 14, input.hours], ["waf_waf.payperuserule", "waf.payperuse.rule", "calc_11_", input.rules, Math.trunc(input.rules), 14, input.hours], ["waf_waf.payperuserequest", "waf.payperuse.request", "calc_12_", input.requests, 1, 32, 1]] as const;
  const products = await Promise.all(entries.map(async ([group, spec, title, count, size, measure, productNum], index) => {
    const p = await selectProduct(context, "waf", input.region, group, spec, input.billing, input.hours);
    Object.assign(p, { resourceSize: size, resouceSizeMeasureId: measure, resourceMeasureName: "", resourceMeasurePluralName: "", addToList_title: title, addToList_product: index === 2 ? "1BSSUNIT.unit.32" : `${count}BSSUNIT.${count > 1 ? "pluralUnit" : "unit"}.${measure}`, usageFactor: "count", usageValue: count, usageMeasureId: 14, durationNum: input.hours, productNum });
    return p;
  }));
  return assembleCard({ ...input, periods: 1, products, description: "Web Application Firewall", rewrite: { calculator_waf_domainOndemandStepper: { UNSET_Stepper_0: stepper(14, input.domains) }, calculator_waf_ruleOndemandStepper: { UNSET_Stepper_0: stepper(14, input.rules) }, calculator_waf_requestOndemandStepper: { UNSET_Stepper_0: stepper(32, input.requests / 1000000) }, calculator_waf_wafModeRadio: { wafMode: "calc_15_" } }, includeQuantity: false }, context.rate);
}
