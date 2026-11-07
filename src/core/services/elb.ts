import { assembleCard, stepper } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildElb(input: Extract<CardInput, { service: "elb" }>, context: BuilderContext) {
  const base = await selectProduct(context, "elb", input.region, "elb_elbv2", "elbv2.basic.default", input.billing, input.hours);
  Object.assign(base, { addToList_title: "calc_44_", addToList_product: "dataInfo_6_", productNum: 1, inquiryTag: "normal" });
  const products = [base];
  const render: Record<string, unknown> = { calculator_elb_type: { elbType: base.elbType ?? null } };
  if (input.billing === "ondemand") {
    if (!Object.hasOwn(base, "usageFactor")) base.usageFactor = "duration";
    const instance = await selectProduct(context, "elb", input.region, "elb_elbv2", "21_instance", input.billing, input.hours);
    Object.assign(instance, { addToList_title: "calc_44_", addToList_product: "dataInfo_2_", productNum: 1, inquiryTag: "normal" });
    if (!Object.hasOwn(instance, "usageFactor")) instance.usageFactor = "duration";
    products.push(instance);
    if (input.public_ip_count === 1) { // network type 1: the page adds a 1 Mbit dynamic BGP bandwidth line billed by duration
      const bw = await selectProduct(context, "elb", input.region, "vpc_bandwidth", "19_bgp", "ondemand", input.hours, plan => plan.usageFactor === "Duration");
      Object.assign(bw, { netType: "calc_2_", eipType: "calc_5_", division: "--", billingType: "calc_10_", tableUnit: "detail_9_", resourceSize: 1, resouceSizeMeasureId: 15, resourceMeasureName: "calc_11_", resourceMeasurePluralName: "", addToList_title: "calc_10_", addToList_product: "calc_5_ | calc_10_ | 1calc_11_", productNum: 1, inquiryTag: "normal", usageMeasurePluralName: "calc_22_" });
      products.push(bw);
    }
    render.calculator_ip = { UNSET_Stepper_0: { measureId: 14, measureValue: input.public_ip_count, measureNameBeforeTrans: "", measurePluralNameBeforeTrans: "" } };
    if (input.public_ip_count === 1) render.calculator_bandwidth = { eipType: "calc_5_", billingType: "calc_10_", UNSET_Stepper_0: stepper(15, 1, "calc_11_", "") }; // appears after network type 1 is chosen
  }
  const card = await assembleCard({ ...input, products, description: "Elastic Load Balance", rewrite: render, includeQuantity: false }, context.rate);
  if (input.billing === "ondemand") {
    const time = card.rewriteValue.global_ONDEMANDTIME as { UNSET_Stepper_0: { measurePluralNameBeforeTrans: string } };
    time.UNSET_Stepper_0.measurePluralNameBeforeTrans = "calc_22_";
  }
  return card;
}
