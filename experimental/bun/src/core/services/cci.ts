import { assembleCard, stepper } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildCci(input: Extract<CardInput, { service: "cci" }>, context: BuilderContext) {
  const specs = [{ spec: "cci.container.cpu", num: input.vcpu, name: "calc_45_", table: "detail_32_", title: "detail_101_", measure: 4, label: "detail_106_", type: "cpu" }, { spec: "cci.container.mem", num: input.mem_gb, name: "calc_43_", table: "detail_33_", title: "detail_102_", measure: 10, label: "detail_103_", type: "mem" }];
  const products = await Promise.all(specs.map(async item => {
    const p = await selectProduct(context, "cci", input.region, "cci_container.instance", item.spec, "ondemand", input.hours);
    Object.assign(p, { resourceSpecType: "DEFAULT", periodList: 0, _skuInfo: [`type: ${item.type}`], type: item.type, productSpecSysDesc: `type:${item.type}`, billingCycle: "detail_31_", arch: "calc_27_", productType: "detail_1_", name: item.name, tableUnit: item.table, addToList_title: item.title, addToList_product: `calc_27_|detail_1_|${item.num}${item.label}`, productNum: item.num, productNumMeasureId: item.measure, productNumMeasureName: item.label, productNumMeasurePluralName: item.label, inquiryTag: "normal", usageFactor: "duration", usageMeasureId: 4, usageValue: input.hours, usageMeasureName: "detail_107_", usageMeasurePluralName: "detail_107_", transRate: "", transTarget: "", cpqPurchaseDuration: 31536000 });
    return p;
  }));
  const card = await assembleCard({ ...input, periods: 1, quantity: 1, products, description: "Cloud Container Instance", rewrite: { calculator_cciSpec_radio: { arch: "calc_27_", productType: "detail_1_" }, calculator_vCPUs_stepper: { UNSET_Stepper_0: stepper(4, input.vcpu, "detail_106_", "detail_106_") }, calculator_mem_stepper: { UNSET_Stepper_0: stepper(10, input.mem_gb, "detail_103_", "detail_103_") } }, includeTime: false, includeQuantity: false }, context.rate);
  card.rewriteValue.global_ONDEMANDTIME = { UNSET_Stepper_0: stepper(4, input.hours, "detail_107_", "detail_107_") };
  card.selectedProduct.purchaseTime = { measureValue: input.hours, measureId: 4, measureNameBeforeTrans: "detail_107_", measurePluralNameBeforeTrans: "detail_107_" };
  return card;
}
