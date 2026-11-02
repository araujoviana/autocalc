import { assembleCard, stepper } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildRedis(input: Extract<CardInput, { service: "redis" }>, context: BuilderContext) {
  const instance = await selectProduct(context, "redis", input.region, "dcs_dcs3", input.spec, input.billing, input.hours);
  Object.assign(instance, { productNum: input.quantity, addToList_title: "calc_1_", addToList_product: `${String(instance.spec ?? "None")} | ${String(instance.instance_type ?? "None")} | ${String(instance.cpu ?? "None")}` });
  const products = [instance], bandwidth = input.bandwidth_mbit;
  if (bandwidth !== undefined && bandwidth > 0) {
    const bw = await selectProduct(context, "redis", input.region, "dcs_dcs.bandwidth", "dcs.additional.bandwidth", input.billing, input.hours);
    Object.assign(bw, { productNum: 1, resourceSize: bandwidth, resouceSizeMeasureId: 36, addToList_title: "calc_1_", addToList_product: `${bandwidth}BSSUNIT.unit.36` });
    products.push(bw);
  }
  const keys = ["edition", "version", "instance_type", "cpu_storage", "repl_spec", "spec"];
  const render: Record<string, unknown> = { calculator_redis_version: Object.fromEntries(keys.map(key => [key, instance[key] ?? null])), calculator_redis_quantity: { UNSET_Stepper_0: stepper(14, input.quantity, "calc_33_", "calc_34_") }, calculator_redis_bandwidth_switch: { UNSET_Stepper_0: stepper(14, bandwidth ? 1 : 2, "dataInfo_1_", "dataInfo_2_") } };
  if (bandwidth) render.calculator_redis_bandwidth = { UNSET_Stepper_0: stepper(36, bandwidth) };
  return assembleCard({ ...input, products, description: "DCS (for Redis)", rewrite: render, includeQuantity: false }, context.rate);
}
