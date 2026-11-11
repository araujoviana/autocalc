import { expect, test } from "bun:test";
import dmsFixture from "../fixtures/contracts/dms-regional.json";
import { inFormOnlyMode } from "../../src/core/cards.ts";
import { CardInput } from "../../src/core/schemas.ts";
import { buildCard } from "../../src/core/services/index.ts";
import { normalizeResourceToCard } from "../../src/core/compiler/normalizer.ts";
import { createSyntheticBusinessCatalog } from "../support/business-catalog.ts";
import { assertSemanticCard, semanticIssues, type CardContract, type ControlExpectation } from "../support/semantic-contracts.ts";

// Literal controls/rates were checked against the public intl service config and
// SP/Santiago catalogs on 2026-11-11 UTC. Raw vendor JS is not committed. These
// assertions certify configuration transformations, not live prices/publication.
const control = (path: string, value: unknown): ControlExpectation => ({ path: path.split("."), value });
const render = (path: string, value: unknown) => control(`rewriteValue.template_RENDER.${path}`, value);
const stepper = (path: string, value: number) => render(`${path}.UNSET_Stepper_0.measureValue`, value);
type Case = { name: string; input: Record<string, unknown>; contract: Omit<CardContract, "region"> };

const cases: Case[] = [
  {
    name: "CCE three masters / 50 nodes / two clusters",
    input: { service: "cce", billing: "monthly", cluster_type: "standard", ha: true, scale: "small", quantity: 2 },
    contract: { service: "cce", billing: "monthly", controls: [
      render("calculator_clustertype_radio.productType", "dataInfo_13_"),
      render("calculator_clustertype_radio.clusterType", "dataInfo_2_"),
      render("calculator_clustertype_radio.clusterNodeScale", "dataInfo_50_"),
      render("calculator_clustertype_radio.clusterMasterScale", "dataInfo_4_"),
      control("rewriteValue.global_QUANTITY.UNSET_Stepper_0.measureValue", 2),
    ], products: [{ resourceSpecCode: "cce.s2.small", productNum: 2 }] },
  },
  {
    name: "CCE unified Standard/Turbo / single master / 200 nodes",
    input: { service: "cce", billing: "monthly", cluster_type: "turbo", ha: false, scale: "medium", quantity: 1 },
    contract: { service: "cce", billing: "monthly", controls: [
      render("calculator_clustertype_radio.productType", "dataInfo_13_"),
      render("calculator_clustertype_radio.clusterType", "dataInfo_2_"),
      render("calculator_clustertype_radio.clusterNodeScale", "dataInfo_200_"),
      render("calculator_clustertype_radio.clusterMasterScale", "dataInfo_5_"),
      control("rewriteValue.global_QUANTITY.UNSET_Stepper_0.measureValue", 1),
    ], products: [{ resourceSpecCode: "cce.s1.medium", productNum: 1 }] },
  },
  {
    name: "dedicated professional ELB / single AZ / TCP",
    input: { service: "elb", type: "dedicated", flavor: "elbv3.professional", billing: "ondemand", az_type: "single", protocol: "tcp", l4_lcu: 5, hours: 400 },
    contract: { service: "elb", billing: "ondemand", controls: [
      render("calculator_elb_type.elbType", "dataInfo_3_"),
      render("calculator_elb_type_spec.azType", "calc_64_"),
      render("calculator_flavor_checkboxGroup.flavorType", ["calc_69_"]),
      stepper("calculator_lcu_network", 5),
      control("rewriteValue.global_ONDEMANDTIME.UNSET_Stepper_0.measureValue", 400),
      control("rewriteValue.global_ONDEMANDTIME.UNSET_Stepper_0.measureId", 4),
    ], products: [
      { resourceSpecCode: "elbv3.professional", usageFactor: "instance_duration", azType: "calc_64_", flavorType: "calc_69_", usageValue: 400, usageMeasureId: 4, productNum: 1 },
      { resourceSpecCode: "elbv3.professional", usageFactor: "l4_lcu_duration", azType: "calc_64_", flavorType: "calc_69_", resourceSize: 5, resouceSizeMeasureId: 14, usageValue: 400, usageMeasureId: 4, productNum: 1 },
    ] },
  },
  {
    name: "same ELB SKU / multiple AZs / TLS",
    input: { service: "elb", type: "dedicated", flavor: "elbv3.professional", billing: "ondemand", az_type: "multi", protocol: "tls", l4_lcu: 10, hours: 600 },
    contract: { service: "elb", billing: "ondemand", controls: [
      render("calculator_elb_type.elbType", "dataInfo_3_"),
      render("calculator_elb_type_spec.azType", "calc_67_"),
      render("calculator_flavor_checkboxGroup.flavorType", ["calc_71_"]),
      stepper("calculator_lcu_network", 10),
      control("rewriteValue.global_ONDEMANDTIME.UNSET_Stepper_0.measureValue", 600),
    ], products: [
      { resourceSpecCode: "elbv3.professional", usageFactor: "instance_duration", azType: "calc_67_", flavorType: "calc_71_", usageValue: 600, usageMeasureId: 4, productNum: 1 },
      { resourceSpecCode: "elbv3.professional", usageFactor: "l4_lcu_duration", azType: "calc_67_", flavorType: "calc_71_", resourceSize: 10, resouceSizeMeasureId: 14, usageValue: 600, usageMeasureId: 4, productNum: 1 },
    ] },
  },
  {
    name: "traffic EIP / three addresses / 120 GB each",
    input: { service: "eip", billing: "ondemand", billed_by: "traffic", traffic_gb: 120, ip_quantity: 3, hours: 300 },
    contract: { service: "eip", billing: "ondemand", controls: [
      render("calculator_eip_radio_type.shareType", "dataInfo_3_"),
      render("calculator_eip_radio.eipType", "dataInfo_6_"),
      render("calculator_eip_radio.UNSET_Stepper_3.measureValue", 120),
      stepper("calculator_ipQuantity_stepper", 3),
      control("rewriteValue.global_ONDEMANDTIME.UNSET_Stepper_0.measureValue", 300),
      control("rewriteValue.global_ONDEMANDTIME.UNSET_Stepper_0.measureId", 4),
    ], products: [
      { resourceSpecCode: "12_bgp", usageFactor: "upflow", usageValue: 120, usageMeasureId: 10, durationNum: 300, productNum: 3 },
      { resourceSpecCode: "5_bgp", usageValue: 300, usageMeasureId: 4, productNum: 3 },
    ] },
  },
  {
    name: "same traffic EIP SKU / one address / 450 GB",
    input: { service: "eip", billing: "ondemand", billed_by: "traffic", traffic_gb: 450, ip_quantity: 1, hours: 500 },
    contract: { service: "eip", billing: "ondemand", controls: [
      render("calculator_eip_radio.UNSET_Stepper_3.measureValue", 450),
      stepper("calculator_ipQuantity_stepper", 1),
      control("rewriteValue.global_ONDEMANDTIME.UNSET_Stepper_0.measureValue", 500),
    ], products: [
      { resourceSpecCode: "12_bgp", usageFactor: "upflow", usageValue: 450, usageMeasureId: 10, durationNum: 500, productNum: 1 },
      { resourceSpecCode: "5_bgp", usageValue: 500, usageMeasureId: 4, productNum: 1 },
    ] },
  },
  {
    name: "Kafka / three brokers / 200 GB per broker",
    input: { service: "kafka", billing: "monthly", spec_id: "c6.2u4g.cluster", brokers: 3, storage_gb: 200, quantity: 1 },
    contract: { service: "kafka", billing: "monthly", controls: [
      render("calculator_kafka_architecture_switch.architectureName", "calc_13_"),
      stepper("calculator_kafka_node_num_stepper", 3),
      stepper("calculator_kafka_new_storage_stepper", 600),
    ], products: [
      { resourceSpecCode: "dms.platinum.c6.kafka", nodeNum: 3, resourceSize: 21, productNum: 1 },
      { resourceSpecCode: "dms.physical.storage.ultra.v2.kafka", resourceSize: 600, resouceSizeMeasureId: 17, productNum: 1 },
    ] },
  },
  {
    name: "same Kafka SKU / five brokers / two instances",
    input: { service: "kafka", billing: "monthly", spec_id: "c6.2u4g.cluster", brokers: 5, storage_gb: 40, quantity: 2 },
    contract: { service: "kafka", billing: "monthly", controls: [
      stepper("calculator_kafka_node_num_stepper", 5),
      stepper("calculator_kafka_new_storage_stepper", 200),
      control("rewriteValue.global_QUANTITY.UNSET_Stepper_0.measureValue", 2),
    ], products: [
      { resourceSpecCode: "dms.platinum.c6.kafka", nodeNum: 5, resourceSize: 35, productNum: 2 },
      { resourceSpecCode: "dms.physical.storage.ultra.v2.kafka", resourceSize: 200, resouceSizeMeasureId: 17, productNum: 2 },
    ] },
  },
  {
    name: "RabbitMQ / three brokers / 150 GB per broker",
    input: { service: "rabbitmq", billing: "monthly", spec_id: "c6.2u4g.cluster", version: "3.8", brokers: 3, storage_gb: 150, quantity: 1 },
    contract: { service: "rabbitmq", billing: "monthly", controls: [
      render("calculator_rabbitMQ_version_switch.UNSET_Switch", "dataInfo_30_"),
      render("calculator_rabbitMQ_architecture_switch.architectureName", "dataInfo_2_"),
      stepper("calculator_rabbitMQ_node_num_stepper", 3),
      stepper("calculator_rabbitMQ_new_storage_stepper", 450),
    ], products: [
      { resourceSpecCode: "dms.platinum.c6.rabbitmq", nodeNum: 3, versionType: "dataInfo_30_", resourceSize: 21, productNum: 1 },
      { resourceSpecCode: "dms.physical.storage.ultra.v2.rabbitmq", resourceSize: 450, resouceSizeMeasureId: 17, productNum: 1 },
    ] },
  },
  {
    name: "RabbitMQ / larger spec / five brokers / 80 GB per broker",
    input: { service: "rabbitmq", billing: "monthly", spec_id: "c6.4u8g.cluster", version: "3.8", brokers: 5, storage_gb: 80, quantity: 1 },
    contract: { service: "rabbitmq", billing: "monthly", controls: [
      render("calculator_rabbitMQ_version_switch.UNSET_Switch", "dataInfo_30_"),
      stepper("calculator_rabbitMQ_node_num_stepper", 5),
      stepper("calculator_rabbitMQ_new_storage_stepper", 400),
    ], products: [
      { resourceSpecCode: "dms.platinum.c6.rabbitmq", nodeNum: 5, resourceSize: 70, productNum: 1 },
      { resourceSpecCode: "dms.physical.storage.ultra.v2.rabbitmq", resourceSize: 400, resouceSizeMeasureId: 17, productNum: 1 },
    ] },
  },
  {
    name: "OBS Standard / 100 GB / one month",
    input: { service: "obs", billing: "ondemand", storage_class: "standard", months: 1, components: [{ factor: "size", value: 100, unit: "GB" }, { factor: "download.external", value: 50 }] },
    contract: { service: "obs", billing: "ondemand", controls: [
      render("calculator_storageType_switch.storageType", "dataInfo_2_"),
      render("calculator_multiAZ_radio.multiAZType", "dataInfo_4_"),
      stepper("calculator_multiAZ_radio", 100),
      render("calculator_multiAZ_radio.UNSET_Stepper_0.measureId", 10),
      render("calculator_multiAZ_radio.UNSET_Stepper_2.measureValue", 1),
    ], products: [
      { resourceSpecCode: "obs.001", usageFactor: "size", usageValue: 100, usageMeasureId: 10, productNum: 720 },
      { resourceSpecCode: "obs.001", usageFactor: "download.external", usageValue: 50, productNum: 1 },
      { resourceSpecCode: "obs", usageFactor: "download.cdn", usageValue: 0, productNum: 1 },
      { resourceSpecCode: "obs.001", usageFactor: "download_crr", usageValue: 0, productNum: 1 },
      { resourceSpecCode: "obs.001", usageFactor: "get", usageValue: 0, productNum: 1 },
      { resourceSpecCode: "obs.001", usageFactor: "put", usageValue: 0, productNum: 1 },
      { resourceSpecCode: "obs.001", usageFactor: "delete", usageValue: 0, productNum: 1 },
    ] },
  },
  {
    name: "same OBS SKU / Archive / 200 TB / three months",
    input: { service: "obs", billing: "ondemand", storage_class: "cold", months: 3, components: [{ factor: "size_cold", value: 200, unit: "TB" }, { factor: "download_cold.external", value: 2048 }] },
    contract: { service: "obs", billing: "ondemand", controls: [
      render("calculator_storageType_switch.storageType", "dataInfo_1_"),
      render("calculator_multiAZ_radio.multiAZType", "dataInfo_4_"),
      stepper("calculator_multiAZ_radio", 200),
      render("calculator_multiAZ_radio.UNSET_Stepper_0.measureId", 9),
      render("calculator_multiAZ_radio.UNSET_Stepper_2.measureValue", 3),
    ], products: [
      { resourceSpecCode: "obs.001", usageFactor: "size_cold", usageValue: 200, usageMeasureId: 9, productNum: 2160 },
      { resourceSpecCode: "obs.001", usageFactor: "download_cold.external", usageValue: 2048, productNum: 1 },
      { resourceSpecCode: "obs", usageFactor: "download.cdn", usageValue: 0, productNum: 1 },
      { resourceSpecCode: "obs.001", usageFactor: "get_cold", usageValue: 0, productNum: 1 },
      { resourceSpecCode: "obs.001", usageFactor: "put_cold", usageValue: 0, productNum: 1 },
      { resourceSpecCode: "obs.001", usageFactor: "delete_cold", usageValue: 0, productNum: 1 },
      { resourceSpecCode: "obs.001", usageFactor: "restore_size_ex", usageValue: 0, productNum: 1 },
      { resourceSpecCode: "obs.001", usageFactor: "transition_cold", usageValue: 0, productNum: 1 },
    ] },
  },
];

const { catalog } = createSyntheticBusinessCatalog();
async function buildInput(input: Record<string, unknown>, region: string) {
  return inFormOnlyMode(() => buildCard(CardInput.parse({ ...input, region }), {
    productInfo: (service, requestedRegion) => {
      const key = `${service}|${requestedRegion}`;
      const fixture = (dmsFixture.catalogs as Record<string, { product: Record<string, Record<string, unknown>[]> }>)[key];
      return fixture ? Promise.resolve(structuredClone(fixture)) : catalog.productInfo(service, requestedRegion);
    },
    rate: async () => { throw new Error("Configuration contracts must not rate or call the network"); },
  }));
}
const build = (example: Case, region: string) => buildInput(example.input, region);

for (const region of ["sa-brazil-1", "la-south-2"]) {
  for (const example of cases) {
    test(`independent configuration contract: ${region} / ${example.name}`, async () => {
      assertSemanticCard(await build(example, region), { ...example.contract, region });
    });
  }
}

test("oracle catches lost controls and same-price wrong configuration on real builder cards", async () => {
  for (const example of cases) {
    const region = "sa-brazil-1";
    const original = await build(example, region);
    const expected = { ...example.contract, region };
    assertSemanticCard(original, expected);
    for (const { path } of expected.controls) {
      const corrupted = structuredClone(original) as Record<string, any>;
      let parent = corrupted;
      for (const key of path.slice(0, -1)) parent = parent[key];
      delete parent[path.at(-1)!];
      expect(semanticIssues(corrupted, expected).some(issue => issue.startsWith("control ")), path.join(".")).toBe(true);
      expect(corrupted.selectedProduct.amount).toBe(original.selectedProduct.amount);
    }
    const missing = structuredClone(original) as Record<string, any>;
    missing.selectedProduct.productAllInfos.pop();
    expect(semanticIssues(missing, expected).some(issue => issue.startsWith("product count"))).toBe(true);
    const duplicate = structuredClone(original) as Record<string, any>;
    duplicate.selectedProduct.productAllInfos.push(duplicate.selectedProduct.productAllInfos[0]);
    expect(semanticIssues(duplicate, expected).some(issue => issue.startsWith("product count"))).toBe(true);
  }
});

test("oracle catches wrong region, billing, broker storage and capacity unit", async () => {
  const example = cases[6]!; // Literal Kafka 3-broker / 600 GB contract.
  const expected = { ...example.contract, region: "sa-brazil-1" };
  const original = await build(example, expected.region);
  for (const [field, value] of [["region", "la-south-2"], ["chargeModeName", "YEARLY"]] as const) {
    const corrupted = structuredClone(original) as Record<string, any>;
    corrupted.selectedProduct[field] = value;
    expect(semanticIssues(corrupted, expected).length).toBeGreaterThan(0);
  }
  for (const [field, value] of [["resourceSize", 200], ["resouceSizeMeasureId", 18], ["productNum", 3]] as const) {
    const corrupted = structuredClone(original) as Record<string, any>;
    corrupted.selectedProduct.productAllInfos[1][field] = value;
    expect(semanticIssues(corrupted, expected).some(issue => issue.startsWith("product "))).toBe(true);
  }
});

// Bounds come from maxNodeNum and the topology expansion in the public service
// configuration, not the resolver's advertised allowedBrokers array.
for (const invalid of [
  { name: "Kafka small cluster above its 30-broker limit", input: { service: "kafka", billing: "monthly", spec_id: "c6.2u4g.cluster", brokers: 31 } },
  { name: "Kafka larger cluster above its 50-broker limit", input: { service: "kafka", billing: "monthly", spec_id: "c6.8u16g.cluster", brokers: 51 } },
  { name: "RabbitMQ AMQP family with multiple brokers", input: { service: "rabbitmq", billing: "monthly", spec_id: "amqp.p2.large.6", version: "amqp", brokers: 3 } },
  { name: "RabbitMQ AMQP specification paired with 3.8", input: { service: "rabbitmq", billing: "monthly", spec_id: "amqp.p2.large.6", version: "3.8", brokers: 1 } },
  { name: "unknown RabbitMQ version", input: { service: "rabbitmq", billing: "monthly", spec_id: "c6.2u4g.cluster", version: "not-a-version", brokers: 3 } },
]) {
  test(`invalid vendor configuration is rejected: ${invalid.name}`, async () => {
    await expect(buildInput(invalid.input, "sa-brazil-1")).rejects.toMatchObject({ code: "VALIDATION" });
  });
}

for (const example of [
  { service: "kafka", spec_id: "kafka.2u4g.single.small", brokers: 3 },
  { service: "rabbitmq", spec_id: "amqp.p2.large.6", version: "amqp", brokers: 3 },
  { service: "rabbitmq", spec_id: "c6.2u4g.cluster", version: "3.8", brokers: 4 },
  { service: "kafka", spec_id: "unknown-explicit-spec", brokers: 3 },
]) {
  test(`declarative DMS rejects explicit invalid intent without substituting: ${JSON.stringify(example)}`, async () => {
    await expect((async () => {
      const { service, ...options } = example;
      const card = normalizeResourceToCard({
        id: "explicit-invalid-dms", service, region: "sa-brazil-1", billing: "monthly",
        availability: "single-az", quantity: 1, options, needs: {},
        horizon: { duration: "1m", effectiveHours: 730, effectiveDays: 30, effectiveMonths: 1, metricMultiplier: 1 },
      });
      return buildInput({ service: card.service, billing: card.billing, ...card.options }, card.region);
    })()).rejects.toMatchObject({ code: "VALIDATION" });
  });
}
