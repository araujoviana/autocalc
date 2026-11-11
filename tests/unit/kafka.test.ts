import { expect, test } from "bun:test";
import { buildKafka } from "../../src/core/services/kafka.ts";

test("Kafka capacity and storage scale with brokers", async () => {
  const planList = [{ billingMode: "MONTHLY", productId: "p" }];
  const context = {
    productInfo: async () => ({
      product: {
        "dms_dms.platinum": [
          { resourceSpecCode: "dms.platinum.c6.kafka", specId: "s6.2u4g.cluster.small", cloudServiceType: "c", resourceType: "r", planList },
          { resourceSpecCode: "dms.platinum.c6.kafka", specId: "kafka.2u4g.single.small", cloudServiceType: "c", resourceType: "r", planList },
        ],
        "dms_dms.storage": [
          { resourceSpecCode: "dms.physical.storage.ultra.v2.kafka", cloudServiceType: "c", resourceType: "r", planList },
          { resourceSpecCode: "dms.physical.storage.high.v2.kafka", cloudServiceType: "c", resourceType: "r", planList },
        ],
      },
    }),
    rate: async (body: Record<string, unknown>) => ({
      productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })),
    }),
  };

  // 1. Cluster Kafka scales with brokers (3 nodes * rate 5 = 15; 3 * 100GB = 300GB)
  const card = await buildKafka(
    { service: "kafka", region: "sa-brazil-1", billing: "monthly", periods: 1, hours: 730, quantity: 1, spec_id: "s6.2u4g.cluster.small", storage_gb: 100, brokers: 3 },
    context
  );
  expect(card.selectedProduct.productAllInfos).toMatchObject([{ resourceSize: 15 }, { resourceSize: 300 }]);

  // 2. Single-node Kafka requires exactly 1 broker
  const single = await buildKafka(
    { service: "kafka", region: "sa-brazil-1", billing: "monthly", periods: 1, hours: 730, quantity: 1, spec_id: "kafka.2u4g.single.small", storage_gb: 100, brokers: 1 },
    context
  );
  expect(single.selectedProduct.productAllInfos).toMatchObject([{ resourceSize: 5 }, { resourceSize: 100 }]);

  // 3. Single-node Kafka with invalid broker count fails closed
  await expect(
    buildKafka(
      { service: "kafka", region: "sa-brazil-1", billing: "monthly", periods: 1, hours: 730, quantity: 1, spec_id: "kafka.2u4g.single.small", storage_gb: 100, brokers: 3 },
      context
    )
  ).rejects.toThrow(/requires exactly 1 broker/);

  // 4. Kafka with high storage resolves high.v2 storage SKU
  const highStorage = await buildKafka(
    { service: "kafka", region: "sa-brazil-1", billing: "monthly", periods: 1, hours: 730, quantity: 1, spec_id: "s6.2u4g.cluster.small", storage_gb: 100, brokers: 3, storage_type: "high" },
    context
  );
  const highProducts = highStorage.selectedProduct.productAllInfos as Array<Record<string, unknown>>;
  expect(highProducts[1]).toMatchObject({
    resourceSpecCode: "dms.physical.storage.high.v2.kafka",
    storageType: "dataInfo_6_",
    resourceSize: 300,
  });
});
