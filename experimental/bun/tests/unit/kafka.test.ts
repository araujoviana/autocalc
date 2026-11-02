import { expect, test } from "bun:test";
import { buildKafka } from "../../src/core/services/kafka.ts";
test("Kafka capacity and storage scale with brokers", async () => {
  const planList = [{ billingMode: "MONTHLY", productId: "p" }];
  const context = { productInfo: async () => ({ product: { "dms_dms.platinum": [{ resourceSpecCode: "dms.platinum.c6.kafka", specId: "kafka.2u4g.single.small", cloudServiceType: "c", resourceType: "r", planList }], "dms_dms.storage": [{ resourceSpecCode: "dms.physical.storage.ultra.v2.kafka", cloudServiceType: "c", resourceType: "r", planList }] } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildKafka({ service: "kafka", region: "r", billing: "monthly", periods: 1, hours: 730, quantity: 1, spec_id: "kafka.2u4g.single.small", storage_gb: 100, brokers: 3 }, context);
  expect(card.selectedProduct.productAllInfos).toMatchObject([{ resourceSize: 15 }, { resourceSize: 300 }]);
});
