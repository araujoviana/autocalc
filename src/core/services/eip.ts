import { assembleCard, stepper } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildEip(input: Extract<CardInput, { service: "eip" }>, context: BuilderContext) {
  if (input.ip_quantity !== undefined && input.eip_count !== undefined && input.ip_quantity !== input.eip_count) {
    throw new CalculatorError("VALIDATION", "Conflicting EIP count aliases: ip_quantity and eip_count must be equal if both are supplied");
  }
  if (input.bandwidth_mbps !== undefined && input.traffic_gb !== undefined && input.traffic_gb > 0) {
    throw new CalculatorError("VALIDATION", "EIP cannot specify both bandwidth_mbps and positive traffic_gb; choose either bandwidth or traffic billing");
  }
  const count = input.ip_quantity ?? input.eip_count ?? 1;
  const isTraffic = input.billed_by === "traffic" || (input.traffic_gb !== undefined && input.traffic_gb > 0 && input.bandwidth_mbps === undefined);

  if (isTraffic) {
    if (input.billing !== "ondemand") throw new CalculatorError("VALIDATION", "EIP billed by traffic only supports on-demand billing");
    const products: Record<string, unknown>[] = [];
    const traffic = Math.max(1, input.traffic_gb ?? 1); // the page's traffic stepper starts at 1 GB
    {
      const p = await selectProduct(context, "eip", input.region, "vpc_bandwidth", "12_bgp", "ondemand", input.hours, plan => plan.usageFactor === "upflow");
      Object.assign(p, { resourceSpecType: "DEFAULT", type: "dataInfo_9_", eipSpec: "dataInfo_1_", shareType: "dataInfo_3_", eipType: "dataInfo_6_", name: "dataInfo_1_", usageFactor1: "upflow", addToList_title: "calc_25_", addToList_product: `dataInfo_3_ | dataInfo_1_ | dataInfo_6_ | ${traffic}BSSUNIT.${traffic > 1 ? "pluralUnit" : "unit"}.10`, usageValue: traffic, usageMeasureId: 10, usageFactor: "upflow", durationNum: input.hours, addToList_purchaseNum: false, cpqPurchaseDuration: 1, cpqPurchaseQuantity: 1 });
      p.productNum = count; // the page bills outbound traffic per address
      products.push(p);
    }
    if (input.ip_reservation) {
      const p = await selectProduct(context, "eip", input.region, "vpc_ip", "5_bgp", "ondemand", input.hours);
      Object.assign(p, { resourceSpecType: "DEFAULT", EIPType: "Dynamic BGP", name: "dataInfo_30_", eipSpec: "dataInfo_1_", ipSpec: "detail_24_", productNum: count, productNumMeasureId: 41, productNumMeasureName: "calc_29_", productNumMeasurePluralName: "", addToList_title: "calc_26_", addToList_product: "1calc_29_", resourceSize: "" });
      products.push(p);
    }
    if (!products.length) throw new CalculatorError("VALIDATION", "EIP requires traffic or IP reservation");
    const card = await assembleCard({ ...input, periods: 1, products, description: "Elastic IP", rewrite: { calculator_eip_radio_type: { shareType: "dataInfo_3_", eipSpec: "dataInfo_1_" }, calculator_eip_radio: { eipType: "dataInfo_6_", UNSET_Stepper_3: stepper(10, traffic) }, calculator_ipQuantity_stepper: { UNSET_Stepper_0: stepper(41, count, "calc_29_", "") } }, includeQuantity: false }, context.rate);
    const time = card.rewriteValue.global_ONDEMANDTIME as { UNSET_Stepper_0: { measurePluralNameBeforeTrans: string } };
    time.UNSET_Stepper_0.measurePluralNameBeforeTrans = "calc_27_";
    return card;
  }

  // Bandwidth billing (dedicated or shared, ondemand/monthly/yearly)
  const mbps = input.bandwidth_mbps ?? 1;
  const shareType = input.share_type ?? "dedicated";
  const specCode = shareType === "shared" ? "19_share" : "19_bgp";
  const shareTypeVal = shareType === "shared" ? "dataInfo_4_" : "dataInfo_3_";
  const products: Record<string, unknown>[] = [];

  const bw = await selectProduct(
    context,
    "eip",
    input.region,
    "vpc_bandwidth",
    specCode,
    input.billing,
    input.hours,
    plan => input.billing === "ondemand" ? plan.usageFactor === "Duration" : true,
  );
  Object.assign(bw, {
    resourceSpecType: "DEFAULT",
    shareType: shareTypeVal,
    eipType: "dataInfo_5_",
    resourceSize: mbps,
    resouceSizeMeasureId: 15,
    productNum: count,
    addToList_title: "calc_25_",
    addToList_product: `${shareTypeVal} | dataInfo_1_ | dataInfo_5_ | ${mbps}calc_11_`,
  });
  if (input.billing === "ondemand") {
    bw.usageFactor = "Duration";
    bw.usageMeasureId = 4;
    bw.usageValue = input.hours;
  }
  products.push(bw);

  if (input.ip_reservation) {
    const pip = await selectProduct(context, "eip", input.region, "vpc_ip", "5_bgp", input.billing, input.hours);
    Object.assign(pip, {
      resourceSpecType: "DEFAULT",
      EIPType: "Dynamic BGP",
      name: "dataInfo_30_",
      eipSpec: "dataInfo_1_",
      ipSpec: "detail_24_",
      productNum: count,
      productNumMeasureId: 41,
      productNumMeasureName: "calc_29_",
      productNumMeasurePluralName: "",
      addToList_title: "calc_26_",
      addToList_product: `${count}calc_29_`,
      resourceSize: "",
    });
    products.push(pip);
  }

  const card = await assembleCard({
    ...input,
    products,
    description: "Elastic IP",
    rewrite: {
      calculator_eip_radio_type: { shareType: shareTypeVal, eipSpec: "dataInfo_1_" },
      calculator_eip_radio: { eipType: "dataInfo_5_", UNSET_Stepper_0: stepper(15, mbps, "calc_11_", "") },
      calculator_ipQuantity_stepper: { UNSET_Stepper_0: stepper(41, count, "calc_29_", "") },
    },
    includeQuantity: false,
  }, context.rate);
  if (input.billing === "ondemand") {
    const time = card.rewriteValue.global_ONDEMANDTIME as { UNSET_Stepper_0: { measurePluralNameBeforeTrans: string } };
    time.UNSET_Stepper_0.measurePluralNameBeforeTrans = "calc_27_";
  }
  return card;
}
