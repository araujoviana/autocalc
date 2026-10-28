import { assembleCard } from "../cards.ts";
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
    render.calculator_ip = { UNSET_Stepper_0: { measureId: 14, measureValue: input.public_ip_count, measureNameBeforeTrans: "", measurePluralNameBeforeTrans: "" } };
  }
  const card = await assembleCard({ ...input, products, description: "Elastic Load Balance", rewrite: render, includeQuantity: false }, context.rate);
  if (input.billing === "ondemand") {
    const time = card.rewriteValue.global_ONDEMANDTIME as { UNSET_Stepper_0: { measurePluralNameBeforeTrans: string } };
    time.UNSET_Stepper_0.measurePluralNameBeforeTrans = "calc_22_";
  }
  return card;
}
