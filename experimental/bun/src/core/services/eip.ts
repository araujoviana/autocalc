import { assembleCard, stepper } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildEip(input: Extract<CardInput, { service: "eip" }>, context: BuilderContext) {
  const products: Record<string, unknown>[] = [];
  if (input.traffic_gb > 0) {
    const p = await selectProduct(context, "eip", input.region, "vpc_bandwidth", "12_bgp", "ondemand", input.hours, plan => plan.usageFactor === "upflow");
    Object.assign(p, { resourceSpecType: "DEFAULT", type: "dataInfo_9_", eipSpec: "dataInfo_1_", shareType: "dataInfo_3_", eipType: "dataInfo_6_", name: "dataInfo_1_", usageFactor1: "upflow", addToList_title: "calc_25_", addToList_product: `dataInfo_3_ | dataInfo_1_ | dataInfo_6_ | ${input.traffic_gb}BSSUNIT.${input.traffic_gb > 1 ? "pluralUnit" : "unit"}.10`, usageValue: input.traffic_gb, usageMeasureId: 10, usageFactor: "upflow", durationNum: input.hours, addToList_purchaseNum: false, cpqPurchaseDuration: 1, cpqPurchaseQuantity: 1 });
    products.push(p);
  }
  if (input.ip_reservation) {
    const p = await selectProduct(context, "eip", input.region, "vpc_ip", "5_bgp", "ondemand", input.hours);
    Object.assign(p, { resourceSpecType: "DEFAULT", EIPType: "Dynamic BGP", name: "dataInfo_30_", eipSpec: "dataInfo_1_", ipSpec: "detail_24_", productNum: input.eip_count, productNumMeasureId: 41, productNumMeasureName: "calc_29_", productNumMeasurePluralName: "", addToList_title: "calc_26_", addToList_product: "1calc_29_", resourceSize: "" });
    products.push(p);
  }
  if (!products.length) throw new CalculatorError("VALIDATION", "EIP requires traffic or IP reservation");
  const card = await assembleCard({ ...input, periods: 1, products, description: "Elastic IP", rewrite: { calculator_eip_radio_type: { shareType: "dataInfo_3_", eipSpec: "dataInfo_1_" }, calculator_eip_radio: { eipType: "dataInfo_6_", UNSET_Stepper_3: stepper(10, input.traffic_gb) }, calculator_ipQuantity_stepper: { UNSET_Stepper_0: stepper(41, input.eip_count, "calc_29_", "") } }, includeQuantity: false }, context.rate);
  const time = card.rewriteValue.global_ONDEMANDTIME as { UNSET_Stepper_0: { measurePluralNameBeforeTrans: string } };
  time.UNSET_Stepper_0.measurePluralNameBeforeTrans = "calc_27_";
  return card;
}
