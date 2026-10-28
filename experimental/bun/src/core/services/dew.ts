import { assembleCard, stepper } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildDew(input: Extract<CardInput, { service: "dew" }>, context: BuilderContext) {
  const csms = input.storage_spec.startsWith("csms");
  if (csms !== input.api_spec.startsWith("csms")) throw new CalculatorError("VALIDATION", "Storage and API specifications must both use KMS or CSMS");
  const duration = csms ? input.days : input.hours;
  const [storage, api] = await Promise.all([selectProduct(context, "dew", input.region, csms ? "kms_csms.storage" : "kms_kms", input.storage_spec, input.billing, input.hours), selectProduct(context, "dew", input.region, csms ? "kms_csms.api" : "kms_kms", input.api_spec, input.billing, input.hours)]);
  Object.assign(storage, { addToList_title: "calc_03_", addToList_product: csms ? `calc_02_ | ${input.keys}detail_117_` : `calc_01_ | dataInfo_11_ | ${input.keys}detail_115_`, usageFactor: "duration", usageValue: duration * input.keys, usageMeasureId: csms ? 0 : 4, resourceSize: input.keys, resouceSizeMeasureId: 41, resourceMeasureName: "", resourceMeasurePluralName: "", ...(csms ? { durationNum: input.days } : {}) });
  Object.assign(api, { addToList_title: "detail_112_", addToList_product: `${input.api_requests}BSSUNIT.unit.54`, usageFactor: csms ? "requestcount" : "reqNumber", usageValue: input.api_requests, usageMeasureId: 54, resourceSize: 1, resouceSizeMeasureId: 54, durationNum: duration, resourceMeasureName: "", resourceMeasurePluralName: "" });
  const tab = csms ? { UNSET_Stepper_1: stepper(41, input.keys, "detail_116_", "detail_117_"), productType: "calc_02_" } : { UNSET_Stepper_0: stepper(41, input.keys, "detail_114_", "detail_115_"), certType: "dataInfo_11_", productType: "calc_01_" };
  const card = await assembleCard({ ...input, periods: 1, products: [storage, api], description: "Data Encryption Workshop", rewrite: { calculator_kms_api: { UNSET_Stepper_0: stepper(54, input.api_requests) }, calculator_productType_tab: tab }, includeQuantity: false }, context.rate);
  card.rewriteValue.global_ONDEMANDTIME = { UNSET_Stepper_0: stepper(csms ? 0 : 4, duration, csms ? "" : "calc_07_") };
  return card;
}
