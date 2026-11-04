import { assembleCard, productFromCatalog, stepper } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import type { BuilderContext } from "./common.ts";
const components: Record<string, [string, string, number, string]> = {
  "download.external": ["obs.001", "calc_8_", 10, "unit"], "download_warm.external": ["obs.001", "calc_8_", 10, "unit"], "download_cold.external": ["obs.001", "calc_8_", 10, "unit"], get: ["obs.001", "calc_13_", 54, "plain12"], put: ["obs.001", "calc_14_", 54, "plain12"], get_warm: ["obs.001", "calc_13_", 31, "plain16"], put_warm: ["obs.001", "calc_14_", 31, "plain16"], delete_warm: ["obs.001", "calc_15_", 31, "plain16"], get_cold: ["obs.001", "calc_13_", 31, "plain16"], put_cold: ["obs.001", "calc_14_", 31, "plain16"], delete_cold: ["obs.001", "calc_15_", 31, "plain16"], delete: ["obs.001", "calc_15_", 31, "plain16"], "download.cdn": ["obs", "calc_10_", 10, "unit"], download_crr: ["obs.001", "calc_11_", 17, "unit"], retrieval_size_warm: ["obs.001", "calc_18_", 10, "retrieval"], restore_size_ex: ["obs.001", "calc_18_", 10, "retrieval"], transition_warm: ["obs.001", "detail_145_", 14, "plain12"], transition_cold: ["obs.001", "detail_145_", 14, "plain12"],
};
export function obsUsageMeasure(factor: string): number | undefined {
  return factor.startsWith("size") ? (factor.endsWith("_3az") ? 17 : 10) : components[factor]?.[2];
}
const steps: Record<string, [string, number, string]> = {
  transition_warm: ["calculator_Request_stepper4", 31, "calc_16_"], transition_cold: ["calculator_Request_stepper4", 31, "calc_16_"],
  "download.external": ["calculator_Outbound_stepper", 10, ""], "download_warm.external": ["calculator_Outbound_stepper", 10, ""], "download_cold.external": ["calculator_Outbound_stepper", 10, ""], download_crr: ["calculator_Replication_stepper", 17, ""], "download.cdn": ["calculator_Traffic_stepper", 10, ""], get: ["calculator_Request_wan_stepper2", 54, "calc_12_"], put: ["calculator_Request_wan_stepper3", 54, "calc_12_"], get_warm: ["calculator_Request_stepper2", 31, "calc_16_"], get_cold: ["calculator_Request_stepper2", 31, "calc_16_"], put_warm: ["calculator_Request_stepper3", 31, "calc_16_"], put_cold: ["calculator_Request_stepper3", 31, "calc_16_"], delete_warm: ["calculator_Request_stepper5", 14, "calc_12_"], delete_cold: ["calculator_Request_stepper5", 14, "calc_12_"], delete: ["calculator_Request_stepper4", 31, "calc_16_"], retrieval_size_warm: ["calculator_Traffic_Read_radio", 10, ""], restore_size_ex: ["calculator_Traffic_Read_radio", 10, ""],
};
const unit = (value: number, measure: number) => `${value}BSSUNIT.${value > 1 ? "pluralUnit" : "unit"}.${measure}`;
export async function buildObs(input: Extract<CardInput, { service: "obs" }>, context: BuilderContext) {
  const classToken = ({ standard: "dataInfo_2_", warm: "dataInfo_3_", cold: "dataInfo_1_" } as Record<string, string>)[input.storage_class];
  if (!classToken) throw new CalculatorError("VALIDATION", "Unknown OBS storage class");
  const az = input.multi_az ? "dataInfo_5_" : "dataInfo_4_", catalog = await context.productInfo("obs", input.region), items = catalog.product.obs_obs ?? [];
  const products: Record<string, unknown>[] = [];
  if (input.package) {
    const raw = items.find(item => item.resourceSpecCode === `obs.storage.${input.package}`);
    if (!raw) throw new CalculatorError("SPEC_NOT_FOUND", "OBS package not found");
    const p = productFromCatalog(raw, input.billing, input.hours);
    Object.assign(p, { resourceSpecType: "DEFAULT", obsStorageSize: raw.obsStorageSize, packageType: raw.packageType ?? "dataInfo_9_", productType: raw.productType ?? "calc_29_", storageType: raw.storageType ?? "dataInfo_2_", addToList_title: "calc_1_", addToList_product: raw.obsStorageSize, productNum: 1, inquiryTag: "normal", selfProductNum: 1, cpqPurchaseDuration: 1, cpqPeriodType: 3, cpqPeriodNum: 1 });
    products.push(p);
    const packageTypes = [p.packageType];
    const render: Record<string, unknown> = { calculator_productType_switch: { productType: p.productType }, calculator_storagePack_radio: { obsStorageSize: raw.obsStorageSize } };
    const traffic = items.find(item => item.resourceSpecCode === "obs.down.traffic.50gb");
    if (traffic) {
      const t = productFromCatalog(traffic, input.billing, input.hours);
      Object.assign(t, { resourceSpecType: "DEFAULT", obsDownTrafficSize: traffic.obsDownTrafficSize, packageType: traffic.packageType ?? "dataInfo_11_", productType: traffic.productType ?? "calc_29_", storageType: traffic.storageType ?? "dataInfo_2_", addToList_title: "calc_3_", addToList_product: traffic.obsDownTrafficSize, productNum: 1, inquiryTag: "normal", selfProductNum: 1, cpqPurchaseDuration: 1, cpqPeriodType: 3, cpqPeriodNum: 1 });
      products.push(t); packageTypes.push(t.packageType); render.calculator_Outbound_radio = { obsDownTrafficSize: traffic.obsDownTrafficSize };
    }
    render.calculator_Pack_checkboxGroup = { packageType: packageTypes };
    return assembleCard({ ...input, products, description: "Object Storage Service", rewrite: render }, context.rate);
  }
  if (input.billing !== "ondemand") throw new CalculatorError("VALIDATION", "OBS usage cards require on-demand billing");
  const render: Record<string, Record<string, unknown>> = {};
  const factors = {
    standard: [input.multi_az ? "size_3az" : "size", "download.external", "download.cdn", "download_crr", "get", "put", "delete"],
    warm: [input.multi_az ? "size_warm_3az" : "size_warm", "download_warm.external", "download.cdn", "download_crr", "get_warm", "put_warm", "delete_warm", "retrieval_size_warm", "transition_warm"],
    cold: ["size_cold", "download_cold.external", "download.cdn", "get_cold", "put_cold", "delete_cold", "restore_size_ex", "transition_cold"],
  }[input.storage_class];
  const supplied = input.components ?? [];
  const full = factors.map(factor => supplied.find(component => component.factor === factor) ?? { factor, value: 0, ...(factor.startsWith("size") ? { unit: "GB" as const } : {}) });
  const combined = [...full, ...supplied.filter(component => !factors.includes(component.factor))];
  for (const item of combined) {
    const factor = item.factor, size = factor.startsWith("size"), [spec, title, defaultMeasure, kind] = size ? ["obs.001", "calc_7_", 9, "size"] as const : components[factor] ?? ["obs.001", "calc_8_", 10, "unit"];
    const raw = items.find(p => p.resourceSpecCode === spec && (!size || p.storageType == null || p.storageType === classToken) && Array.isArray(p.planList) && p.planList.some(plan => typeof plan === "object" && plan !== null && (plan as Record<string, unknown>).usageFactor === factor));
    if (!raw) throw new CalculatorError("SPEC_NOT_FOUND", `OBS usage line ${factor} not found`);
    const p = productFromCatalog(raw, "ondemand", input.hours, plan => plan.usageFactor === factor);
    const measure = size ? item.unit === "TB" ? 9 : 10 : defaultMeasure, transition = factor.startsWith("transition");
    if (size) Object.assign(p, { productNum: 720, usageValue: input.multi_az ? item.value * (item.unit === "TB" ? 1024 : 1) : item.value, usageMeasureId: input.multi_az ? 17 : measure, addToList_product: `${classToken} | ${item.value}${item.unit} | ${az} | ${input.storage_class === "cold" ? "calc_30_" : "calc_29_"} | calc_45_:1calc_46_` });
    else {
      const label = transition ? `${item.value / 10000}calc_12_` : kind === "unit" ? unit(item.value, measure) : kind === "retrieval" ? `dataInfo_6_ | ${unit(item.value, measure)}` : `${item.value}${kind === "plain12" ? "calc_12_" : "calc_16_"}`;
      Object.assign(p, { usageValue: item.value, usageMeasureId: measure, productNum: 1, addToList_product: label, ...(!transition && kind !== "retrieval" ? { resourceSize: 1, resouceSizeMeasureId: measure, resourceMeasureName: "", resourceMeasurePluralName: "" } : {}) });
    }
    Object.assign(p, { addToList_title: title, inquiryTag: "normal", selfProductNum: 1 }); products.push(p);
    if (size) (render.calculator_multiAZ_radio ??= {})[input.multi_az ? "UNSET_Stepper_1" : "UNSET_Stepper_0"] = stepper(measure, item.value);
    else if (steps[factor]) { const [key, mid, label] = steps[factor]; const control = render[key] ??= {}; control.UNSET_Stepper_0 = stepper(mid, transition ? item.value / 10000 : item.value, label, label); if (key === "calculator_Traffic_Read_radio") control.restorationType = "dataInfo_6_"; }
  }
  if (render.calculator_multiAZ_radio) Object.assign(render.calculator_multiAZ_radio, { UNSET_Stepper_2: stepper(20, 1), multiAZType: az });
  else render.calculator_multiAZ_radio = { multiAZType: az };
  render.calculator_productType_switch = { productType: "calc_29_" }; render.calculator_storageType_switch = { storageType: classToken };
  return assembleCard({ ...input, billing: "ondemand", products, description: "Object Storage Service", rewrite: render, includeTime: false, includeQuantity: false }, context.rate);
}
