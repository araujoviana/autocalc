import { expect, test } from "bun:test";
import { buildRabbitmq } from "../../src/core/services/rabbitmq.ts";
test("RabbitMQ uses vendor service case and scales broker capacity", async () => {
  const planList = [{ billingMode: "MONTHLY", productId: "p" }];
  const context = {
    productInfo: async (service: string) => {
      expect(service).toBe("rabbitMQ");
      return {
        product: {
          "dms_dms.platinum": [
            { resourceSpecCode: "dms.platinum.c6.rabbitmq", specId: "c6.2u4g.cluster", architectureName: "Cluster", cloudServiceType: "c", resourceType: "r", planList },
            { resourceSpecCode: "dms.platinum.c6.rabbitmq", specId: "amqp.p2.large.6", architectureName: "Cluster", cloudServiceType: "c", resourceType: "r", planList },
          ],
          "dms_dms.storage": [
            { resourceSpecCode: "dms.physical.storage.ultra.v2.rabbitmq", cloudServiceType: "c", resourceType: "r", planList },
            { resourceSpecCode: "dms.physical.storage.high.v2.rabbitmq", cloudServiceType: "c", resourceType: "r", planList },
          ],
        },
      };
    },
    rate: async (body: Record<string, unknown>) => ({
      productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })),
    }),
  };

  const card = await buildRabbitmq({ service: "rabbitmq", region: "sa-brazil-1", billing: "monthly", periods: 1, hours: 730, quantity: 1, spec_id: "c6.2u4g.cluster", storage_gb: 100, brokers: 3, version: "3.8" }, context);
  expect(card.selectedProduct).toMatchObject({ serviceCode: "rabbitMQ", productAllInfos: [{ resourceSize: 21 }, { resourceSize: 300 }] });

  // Invalid broker count for c6 cluster fails closed
  await expect(
    buildRabbitmq({ service: "rabbitmq", region: "sa-brazil-1", billing: "monthly", periods: 1, hours: 730, quantity: 1, spec_id: "c6.2u4g.cluster", storage_gb: 100, brokers: 2, version: "3.8" }, context)
  ).rejects.toThrow(/Invalid broker count/);

  // AMQP single ECS building
  const amqpCard = await buildRabbitmq(
    { service: "rabbitmq", region: "sa-brazil-1", billing: "monthly", periods: 1, hours: 730, quantity: 1, spec_id: "amqp.p2.large.6", storage_gb: 100, brokers: 1, version: "amqp" },
    context
  );
  const amqpProducts = amqpCard.selectedProduct.productAllInfos as Array<Record<string, unknown>>;
  expect(amqpProducts[0]).toMatchObject({
    resourceSize: 21,
    nodeNum: 1,
    versionType: "dataInfo_29_",
  });
  const amqpTemplate = amqpCard.rewriteValue.template_RENDER as Record<string, unknown>;
  expect(amqpTemplate.calculator_rabbitMQ_version_switch).toEqual({ UNSET_Switch: "dataInfo_29_" });
  // AMQP node_num stepper is not shown on page
  expect(amqpTemplate.calculator_rabbitMQ_node_num_stepper).toBeUndefined();

  // RabbitMQ with high storage resolves high.v2
  const highStorage = await buildRabbitmq(
    { service: "rabbitmq", region: "sa-brazil-1", billing: "monthly", periods: 1, hours: 730, quantity: 1, spec_id: "c6.2u4g.cluster", storage_gb: 100, brokers: 3, version: "3.8", storage_type: "high" },
    context
  );
  const highProducts = highStorage.selectedProduct.productAllInfos as Array<Record<string, unknown>>;
  expect(highProducts[1]).toMatchObject({
    resourceSpecCode: "dms.physical.storage.high.v2.rabbitmq",
    storageType: "dataInfo_11_",
    resourceSize: 300,
  });
});
