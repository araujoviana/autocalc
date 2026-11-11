import { assembleCard, stepper } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildElb(input: Extract<CardInput, { service: "elb" }>, context: BuilderContext) {
  if (input.type === "dedicated") {
    if (input.billing !== "ondemand") throw new CalculatorError("VALIDATION", "Dedicated ELB only supports on-demand billing");
    const flavor = input.flavor ?? input.spec ?? "elbv3.professional";
    const azType = input.az_type === "multi" ? "calc_67_" : "calc_64_";
    const protocolFlavor = ({ tcp: "calc_69_", udp: "calc_70_", tls: "calc_71_" } as Record<string, string>)[input.protocol ?? "tcp"] ?? "calc_69_";

    // 1. Select the base instance product with matching azType and protocolFlavor
    const base = await selectProduct(
      context,
      "elb",
      input.region,
      "elb_elbv3",
      flavor,
      "ondemand",
      input.hours,
      plan => plan.billingEvent === "event.type.elb.elbv3.instance_duration",
      p => p.azType === azType && (p.flavorType === protocolFlavor || p.flavorType === "calc_69_")
    );
    Object.assign(base, {
      addToList_title: "calc_44_",
      addToList_product: `${azType} | dataInfo_3_`,
      productNum: 1,
      inquiryTag: "normal",
      resouceSizeMeasureId: 14,
      usageMeasureId: 4,
      usageValue: input.hours,
      usageFactor: "instance_duration",
      elbType: "dataInfo_3_",
      azType,
      flavorType: protocolFlavor,
    });
    const products = [base];

    const l4 = input.l4_lcu ?? input.lcu ?? 0;
    const l7 = input.l7_lcu ?? 0;
    if (l4 > 0) {
      const pL4 = await selectProduct(
        context,
        "elb",
        input.region,
        "elb_elbv3",
        flavor,
        "ondemand",
        input.hours,
        plan => plan.billingEvent === "event.type.elb.elbv3.l4_lcu_duration",
        p => p.azType === azType && (p.flavorType === protocolFlavor || p.flavorType === "calc_38_" || p.flavorType === "calc_69_")
      );
      Object.assign(pL4, {
        addToList_title: protocolFlavor,
        addToList_product: `${azType} | ${l4} LCU`,
        productNum: 1,
        inquiryTag: "normal",
        resourceSize: l4,
        resouceSizeMeasureId: 14,
        usageFactor: "l4_lcu_duration",
        usageMeasureId: 4,
        usageValue: input.hours,
        cpqPurchaseCapacity: l4,
        azType,
        flavorType: protocolFlavor,
      });
      products.push(pL4);
    }
    if (l7 > 0) {
      const pL7 = await selectProduct(
        context,
        "elb",
        input.region,
        "elb_elbv3",
        flavor,
        "ondemand",
        input.hours,
        plan => plan.billingEvent === "event.type.elb.elbv3.l7_lcu_duration",
        p => p.azType === azType && p.flavorType === "calc_39_"
      );
      Object.assign(pL7, {
        addToList_title: "calc_39_",
        addToList_product: `${azType} | ${l7} LCU`,
        productNum: 1,
        inquiryTag: "normal",
        resourceSize: l7,
        resouceSizeMeasureId: 14,
        usageFactor: "l7_lcu_duration",
        usageMeasureId: 4,
        usageValue: input.hours,
        cpqPurchaseCapacity: l7,
        azType,
        flavorType: "calc_39_",
      });
      products.push(pL7);
    }
    const render: Record<string, unknown> = {
      calculator_elb_type: { elbType: "dataInfo_3_" },
      calculator_elb_type_spec: { azType, flavorCatagory: "calc_43_" },
      calculator_flavor_checkboxGroup: { flavorType: [protocolFlavor, ...(l7 > 0 ? ["calc_39_"] : [])] },
    };
    if (l4 > 0) {
      render.calculator_lcu_network = { UNSET_Stepper_0: stepper(14, l4, "calc_37_", "calc_37_") };
    }
    if (l7 > 0) {
      render.calculator_lcu_application = { UNSET_Stepper_0: stepper(14, l7, "calc_37_", "calc_37_") };
    }
    const card = await assembleCard({ ...input, products, description: "Elastic Load Balance", rewrite: render, includeQuantity: false }, context.rate);
    const time = card.rewriteValue.global_ONDEMANDTIME as { UNSET_Stepper_0: { measurePluralNameBeforeTrans: string } };
    time.UNSET_Stepper_0.measurePluralNameBeforeTrans = "calc_22_";
    return card;
  }

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
