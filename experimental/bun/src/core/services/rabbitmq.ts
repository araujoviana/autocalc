import { assembleCard, productFromCatalog, stepper } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
const rates: Record<string, number> = { "c6.2u4g.single": 7, "c6.4u8g.single": 14, "c6.8u16g.single": 27, "c6.16u32g.single": 50, "c6.24u48g.single": 75, "c6.2u4g.cluster": 7, "c6.4u8g.cluster": 14, "c6.8u16g.cluster": 27, "c6.12u24g.cluster": 41, "c6.16u32g.cluster": 50, "c6.24u48g.cluster": 75, "c6.32u64g.cluster": 100, "amqp.p1.large.2": 7, "amqp.p1.large.4": 14, "amqp.p2.large.6": 21, "amqp.p2.large.10": 35, "amqp.p2.large.14": 49, "amqp.p2.large.20": 70, "amqp.p2.large.28": 98, "amqp.p2.large.40": 135, "amqp.p2.large.56": 189, "amqp.p2.large.80": 205, "amqp.p2.large.112": 387, "amqp.p2.large.144": 300, "amqp.p2.large.200": 375, "amqp.p2.large.240": 500, "amqp.p2.large.280": 525 };
export async function buildRabbitmq(input: Extract<CardInput, { service: "rabbitmq" }>, context: BuilderContext) {
  const rate = rates[input.spec_id];
  if (rate === undefined) throw new CalculatorError("VALIDATION", `Unknown RabbitMQ specification ${input.spec_id}`);
  const architecture = input.spec_id.endsWith(".cluster") ? "cluster" : "single";
  if (input.spec_id.startsWith("c6.") && !(architecture === "single" ? [1] : [3, 5, 7]).includes(input.brokers)) throw new CalculatorError("VALIDATION", "Invalid broker count for RabbitMQ specification");
  const catalog = await context.productInfo("rabbitMQ", input.region);
  const raw = catalog.product["dms_dms.platinum"]?.find(p => p.resourceSpecCode === "dms.platinum.c6.rabbitmq" && p.specId === input.spec_id);
  if (!raw) throw new CalculatorError("SPEC_NOT_FOUND", `RabbitMQ specification ${input.spec_id} not found`);
  const inst = productFromCatalog(raw, input.billing, input.hours), capacity = rate * input.brokers, storage = input.storage_gb * input.brokers;
  const version = input.version === "amqp" ? "dataInfo_29_" : "dataInfo_30_";
  Object.assign(inst, { resourceSpecType: "ResourceGroup", instanceUnit: "detail_19_", specName: raw.specName ?? null, versionType: version, architectureId: architecture, architectureName: raw.architectureName ?? null, addToList_title: "calc_6_", addToList_product: `${String(raw.architectureName ?? "None")} | ${input.spec_id} | calc_7_detail_39_${input.brokers}`, resourceSize: capacity, resouceSizeMeasureId: 14, cpqPurchaseCapacity: capacity, nodeNum: input.brokers });
  const disk = await selectProduct(context, "rabbitMQ", input.region, "dms_dms.storage", "dms.physical.storage.ultra.v2.rabbitmq", input.billing, input.hours);
  Object.assign(disk, { resourceSpecType: "DEFAULT", resourceSize: storage, resouceSizeMeasureId: 17, resourceMeasureName: "", resourceMeasurePluralName: "", addToList_title: "detail_43_", storageType: "dataInfo_12_", addToList_product: `dataInfo_12_ | ${storage}GB ( calc_8_: ${storage}GB )` });
  return assembleCard({ ...input, service: "rabbitMQ", products: [inst, disk], description: "DMS (for RabbitMQ)", rewrite: { calculator_rabbitMQ_version_switch: { UNSET_Switch: version }, calculator_rabbitMQ_architecture_switch: { architectureName: raw.architectureName ?? null }, calculator_rabbitMQ_specType_switch: { specName: raw.specName ?? null }, calculator_rabbitMQ_node_num_stepper: { UNSET_Stepper_0: stepper(14, input.brokers, "calc_9_", "calc_10_") }, calculator_rabbitMQ_new_storage_stepper: { storageType: "dataInfo_12_", UNSET_Stepper_0: stepper(17, storage) } } }, context.rate);
}
