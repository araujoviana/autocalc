import { assembleCard, productFromCatalog, stepper } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
import { resolveRabbitmqConfig } from "./dms-config.ts";

export async function buildRabbitmq(input: Extract<CardInput, { service: "rabbitmq" }>, context: BuilderContext) {
  const dmsConfig = resolveRabbitmqConfig(input.spec_id, input.brokers, input.version);
  const catalog = await context.productInfo("rabbitMQ", input.region);
  const raw = catalog.product["dms_dms.platinum"]?.find(
    p => p.resourceSpecCode === "dms.platinum.c6.rabbitmq" && p.specId === input.spec_id
  );
  if (!raw) throw new CalculatorError("SPEC_NOT_FOUND", `RabbitMQ specification ${input.spec_id} not found in ${input.region}`);
  const inst = productFromCatalog(raw, input.billing, input.hours);
  const capacity = dmsConfig.conversionRate * input.brokers;
  const storage = input.storage_gb * input.brokers;
  const version = input.version === "amqp" ? "dataInfo_29_" : "dataInfo_30_";

  Object.assign(inst, {
    resourceSpecType: "ResourceGroup",
    instanceUnit: "detail_19_",
    specName: raw.specName ?? null,
    versionType: version,
    architectureId: dmsConfig.architecture,
    architectureName: raw.architectureName ?? null,
    addToList_title: "calc_6_",
    addToList_product: `${String(raw.architectureName ?? "None")} | ${input.spec_id} | calc_7_detail_39_${input.brokers}`,
    resourceSize: capacity,
    resouceSizeMeasureId: 14,
    cpqPurchaseCapacity: capacity,
    nodeNum: input.brokers,
  });

  const disk = await selectProduct(context, "rabbitMQ", input.region, "dms_dms.storage", dmsConfig.storageSpec, input.billing, input.hours);
  Object.assign(disk, {
    resourceSpecType: "DEFAULT",
    resourceSize: storage,
    resouceSizeMeasureId: 17,
    resourceMeasureName: "",
    resourceMeasurePluralName: "",
    addToList_title: "detail_43_",
    storageType: dmsConfig.storageType,
    addToList_product: `${dmsConfig.storageType} | ${storage}GB ( calc_8_: ${storage}GB )`,
  });

  return assembleCard(
    {
      ...input,
      service: "rabbitMQ",
      products: [inst, disk],
      description: "DMS (for RabbitMQ)",
      rewrite: {
        calculator_rabbitMQ_version_switch: { UNSET_Switch: version },
        calculator_rabbitMQ_architecture_switch: { architectureName: raw.architectureName ?? null },
        calculator_rabbitMQ_specType_switch: { specName: raw.specName ?? null },
        calculator_rabbitMQ_node_num_stepper: { UNSET_Stepper_0: stepper(14, input.brokers, "calc_9_", "calc_10_") },
        calculator_rabbitMQ_new_storage_stepper: { storageType: dmsConfig.storageType, UNSET_Stepper_0: stepper(17, storage) },
      },
    },
    context.rate
  );
}
