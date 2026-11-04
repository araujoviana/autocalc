import { assembleCard, stepper } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildLts(input: Extract<CardInput, { service: "lts" }>, context: BuilderContext) {
  const knobs = { flow: 1, index_rate: 100, storage: 90, hot: 30, basic: 2, senior: 2, ...input.knobs };
  const entries = [["lts_lts.logflow", "lts.log.flow", "traffic", "detail_7_", input.flow_gb, 10, input.flow_gb], ["lts_lts.logindex", "lts.log.index", "traffic", "detail_6_", input.index_gb, 10, input.index_gb], ["lts_lts.logstorage", "lts.log.storage.cold", "logcoldstoragesize", "detail_39_", input.cold_mb, 17, input.cold_mb / 720], ["lts_lts.logstorage", "lts.log.storage", "aom.size", "detail_5_", input.storage_mb, 17, input.storage_mb / 720], ["lts_lts.logtransfer", "lts.log.transfer.basic", "logbasictransfertraffic", "calc_23_", input.transfer_basic_gb, 10, input.transfer_basic_gb], ["lts_lts.logtransfer", "lts.log.transfer.senior", "logseniortransfertraffic", "calc_24_", input.transfer_senior_gb, 10, input.transfer_senior_gb]] as const;
  const products = await Promise.all(entries.map(async ([group, spec, factor, title, value, measure, display]) => {
    const p = await selectProduct(context, "lts", input.region, group, spec, input.billing, input.hours);
    Object.assign(p, { addToList_title: title, addToList_product: `${display.toFixed(2)} GB`, usageFactor: factor, usageValue: value, usageMeasureId: measure, durationNum: 1 });
    return p;
  }));
  const card = await assembleCard({ ...input, periods: 1, products, description: "Log Tank Service", rewrite: {
    calculator_ltsLogFlow_stepper: { UNSET_Stepper_0: stepper(10, knobs.flow, "detail_24_", "detail_24_") },
    calculator_ltsLogIndexRate_stepper: { UNSET_Stepper_0: stepper(17, knobs.index_rate, "calc_20_", "calc_20_") },
    calculator_ltsStorage_stepper: { UNSET_Stepper_0: stepper(17, knobs.storage, "detail_26_", "detail_26_") },
    calculator_ltsHotStorage_stepper: { UNSET_Stepper_0: stepper(17, knobs.hot, "detail_26_", "detail_26_") },
    calculator_lts_cold_switch: { UNSET_Switch: "calc_3_" },
    calculator_lts_transfer_basic_stepper: { UNSET_Stepper_0: stepper(10, knobs.basic, "detail_24_", "detail_24_") },
    calculator_lts_transfer_senior_stepper: { UNSET_Stepper_0: stepper(10, knobs.senior, "detail_24_", "detail_24_") },
  }, includeTime: false, includeQuantity: false }, context.rate);
  card.rewriteValue.global_ONDEMANDTIME = { UNSET_Stepper_0: stepper(20, 1) };
  return card;
}
