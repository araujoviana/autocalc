import { assembleCard, productFromCatalog, stepper } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
const rates: Record<string, number> = { "kafka.2u4g.single.small": 5, "kafka.2u4g.single": 7, "s6.2u4g.cluster.small": 5, "c6.2u4g.cluster": 7, "c6.4u8g.cluster": 14, "c6.8u16g.cluster": 27, "c6.12u24g.cluster": 41, "c6.16u32g.cluster": 50 };
export async function buildKafka(input: Extract<CardInput, { service: "kafka" }>, context: BuilderContext) {
  const rate = rates[input.spec_id];
  if (rate === undefined) throw new CalculatorError("VALIDATION", `Unknown Kafka specification ${input.spec_id}`);
  const catalog = await context.productInfo("kafka", input.region);
  const raw = catalog.product["dms_dms.platinum"]?.find(p => p.resourceSpecCode === "dms.platinum.c6.kafka" && p.specId === input.spec_id);
  if (!raw) throw new CalculatorError("SPEC_NOT_FOUND", `Kafka specification ${input.spec_id} not found`);
  const inst = productFromCatalog(raw, input.billing, input.hours), capacity = rate * input.brokers, storage = input.storage_gb * input.brokers;
  Object.assign(inst, { resourceSpecType: "ResourceGroup", specName: raw.specName ?? null, architectureName: raw.architectureName ?? null, addToList_title: "calc_5_", addToList_product: `${String(raw.specName ?? "None")} | calc_4_detail_32_${input.brokers}`, resourceSize: capacity, resouceSizeMeasureId: 14, resourceMeasureName: "", resourceMeasurePluralName: "", cpqPurchaseCapacity: capacity, nodeNum: input.brokers });
  const disk = await selectProduct(context, "kafka", input.region, "dms_dms.storage", "dms.physical.storage.ultra.v2.kafka", input.billing, input.hours);
  Object.assign(disk, { resourceSpecType: "ResourceGroup", storageType: "dataInfo_7_", storageUnit: "detail_9_", resourceSize: storage, resouceSizeMeasureId: 17, resourceMeasureName: "", resourceMeasurePluralName: "", addToList_title: "detail_35_", addToList_product: `dataInfo_7_ | ${storage}GB` });
  return assembleCard({ ...input, products: [inst, disk], description: "DMS (for Kafka)", rewrite: { calculator_kafka_architecture_switch: { architectureName: raw.architectureName ?? null }, calculator_kafka_specType_switch: { specName: raw.specName ?? null }, calculator_kafka_node_num_stepper: { UNSET_Stepper_0: stepper(14, input.brokers) }, calculator_kafka_new_storage_stepper: { storageType: "dataInfo_7_", UNSET_Stepper_0: stepper(17, storage) } } }, context.rate);
}
