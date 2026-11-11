import { assembleCard, productFromCatalog, stepper } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
import { resolveKafkaConfig } from "./dms-config.ts";

export async function buildKafka(input: Extract<CardInput, { service: "kafka" }>, context: BuilderContext) {
  const dmsConfig = resolveKafkaConfig(input.spec_id, input.brokers);
  const catalog = await context.productInfo("kafka", input.region);
  const raw = catalog.product["dms_dms.platinum"]?.find(
    p => (p.resourceSpecCode === "dms.platinum.c6.kafka" || p.resourceSpecCode === "dms.platinum.ac6.kafka") && p.specId === input.spec_id
  );
  if (!raw) throw new CalculatorError("SPEC_NOT_FOUND", `Kafka specification ${input.spec_id} not found in ${input.region}`);
  const inst = productFromCatalog(raw, input.billing, input.hours);
  const capacity = dmsConfig.conversionRate * input.brokers;
  const storage = input.storage_gb * input.brokers;

  Object.assign(inst, {
    resourceSpecType: "ResourceGroup",
    specName: raw.specName ?? null,
    architectureName: raw.architectureName ?? null,
    addToList_title: "calc_5_",
    addToList_product: `${String(raw.specName ?? "None")} | calc_4_detail_32_${input.brokers}`,
    resourceSize: capacity,
    resouceSizeMeasureId: 14,
    resourceMeasureName: "",
    resourceMeasurePluralName: "",
    cpqPurchaseCapacity: capacity,
    nodeNum: input.brokers,
  });

  const disk = await selectProduct(context, "kafka", input.region, "dms_dms.storage", dmsConfig.storageSpec, input.billing, input.hours);
  Object.assign(disk, {
    resourceSpecType: "ResourceGroup",
    storageType: dmsConfig.storageType,
    storageUnit: dmsConfig.storageUnit,
    resourceSize: storage,
    resouceSizeMeasureId: 17,
    resourceMeasureName: "",
    resourceMeasurePluralName: "",
    addToList_title: "detail_35_",
    addToList_product: `${dmsConfig.storageType} | ${storage}GB`,
  });

  return assembleCard(
    {
      ...input,
      products: [inst, disk],
      description: "DMS (for Kafka)",
      rewrite: {
        calculator_kafka_architecture_switch: { architectureName: raw.architectureName ?? null },
        calculator_kafka_specType_switch: { specName: raw.specName ?? null },
        calculator_kafka_node_num_stepper: { UNSET_Stepper_0: stepper(14, input.brokers) },
        calculator_kafka_new_storage_stepper: { storageType: dmsConfig.storageType, UNSET_Stepper_0: stepper(17, storage) },
      },
    },
    context.rate
  );
}
