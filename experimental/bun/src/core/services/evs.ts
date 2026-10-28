import { assembleCard, stepper } from "../cards.ts";
import { CONSOLE } from "../endpoints.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildEvs(input: Extract<CardInput, { service: "evs" }>, context: BuilderContext) {
  const extra = ["GPSSD2", "ESSD2"].includes(input.type);
  const volume = await selectProduct(context, "evs", input.region, "ebs_volume", extra ? `${input.type}.storage` : input.type, input.billing, input.hours);
  Object.assign(volume, { resourceSize: input.size_gb, resouceSizeMeasureId: 17, resourceMeasureName: "detail_42_", resourceMeasurePluralName: "detail_42_", addToList_title: "calc_4_", addToList_product: `${String(volume.productType ?? "")} | ${input.size_gb}detail_42_`, productNum: input.quantity });
  const products = [volume];
  const labels: Record<string, string> = { SATA: "calc_1_", SAS: "calc_2_", SSD: "calc_3_", GPSSD: "calc_7_", ESSD: "calc_8_", GPSSD2: "calc_9_", ESSD2: "calc_10_" };
  const render: Record<string, unknown> = { calculator_product_stepper: { UNSET_Stepper_0: stepper(17, input.size_gb, "detail_42_", "detail_42_"), productType: labels[input.type] ?? "calc_7_" } };
  if (extra && input.billing === "ondemand") {
    const iops = input.iops ?? 3000, throughput = input.throughput ?? 125;
    const [iop, tp] = await Promise.all([selectProduct(context, "evs", input.region, "ebs_volume", `${input.type}.iops`, input.billing, input.hours), selectProduct(context, "evs", input.region, "ebs_volume", `${input.type}.throughput`, input.billing, input.hours)]);
    Object.assign(iop, { usageValue: Math.max(0, iops - 3000), usageMeasureId: iop.measureUnit, usageMeasureName: "detail_36_", usageMeasurePluralName: "detail_36_", addToList_title: "detail_28_", addToList_product: `${iops}detail_36_`, productNum: Math.trunc(input.quantity * input.hours), durationNum: input.hours });
    Object.assign(tp, { usageValue: Math.max(0, throughput - 125), usageMeasureId: tp.measureUnit, usageMeasureName: "detail_35_", usageMeasurePluralName: "detail_35_", addToList_title: "detail_29_", addToList_product: `${throughput}detail_35_`, productNum: Math.trunc(input.quantity * input.hours), durationNum: input.hours });
    products.push(iop, tp);
    render.calculator_evs_iops = { UNSET_Stepper_0: stepper(75, iops, "detail_36_", "detail_36_") };
    render.calculator_evs_throughput = { UNSET_Stepper_0: stepper(77, throughput, "detail_35_", "detail_35_") };
  }
  const period = input.billing === "ondemand" ? "" : `${input.periods}${input.billing === "monthly" ? "m" : "y"}`;
  const buyUrl = `${CONSOLE}?region=${input.region}&locale=en-us&charging=${input.billing === "ondemand" ? 0 : 1}&type=${input.type}&capacity=${input.size_gb}&count=${input.quantity}&iops=${input.billing === "ondemand" ? input.iops ?? "" : ""}&throughput=${input.billing === "ondemand" ? input.throughput ?? "" : ""}&period=${period}#/evs/createvolume`;
  const card = await assembleCard({ ...input, products, description: "Elastic Volume Service", rewrite: render, buyUrl }, context.rate);
  const quantity = card.rewriteValue.global_QUANTITY as { UNSET_Stepper_0: { measureNameBeforeTrans: string; measurePluralNameBeforeTrans: string } };
  quantity.UNSET_Stepper_0.measureNameBeforeTrans = "calc_5_"; quantity.UNSET_Stepper_0.measurePluralNameBeforeTrans = "calc_6_";
  Object.assign(card.selectedProduct.purchaseNum as Record<string, unknown>, { measureNameBeforeTrans: "calc_5_", measurePluralNameBeforeTrans: "calc_6_" });
  return card;
}
