import { expect, test } from "bun:test";
import { buildRabbitmq } from "../../src/core/services/rabbitmq.ts";
test("RabbitMQ uses vendor service case and scales broker capacity", async () => {
  const planList = [{ billingMode: "MONTHLY", productId: "p" }];
  const context = { productInfo: async (service: string) => { expect(service).toBe("rabbitMQ"); return { product: { "dms_dms.platinum": [{ resourceSpecCode: "dms.platinum.c6.rabbitmq", specId: "c6.2u4g.cluster", cloudServiceType: "c", resourceType: "r", planList }], "dms_dms.storage": [{ resourceSpecCode: "dms.physical.storage.ultra.v2.rabbitmq", cloudServiceType: "c", resourceType: "r", planList }] } }; }, rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildRabbitmq({ service: "rabbitmq", region: "r", billing: "monthly", periods: 1, hours: 730, quantity: 1, spec_id: "c6.2u4g.cluster", storage_gb: 100, brokers: 3, version: "3.8" }, context);
  expect(card.selectedProduct).toMatchObject({ serviceCode: "rabbitMQ", productAllInfos: [{ resourceSize: 21 }, { resourceSize: 300 }] });
});
