import { expect, test } from "bun:test";
import { buildRedis } from "../../src/core/services/redis.ts";
test("Redis omits bandwidth and pins its form switch when no bandwidth requested", async () => {
  const context = { productInfo: async () => ({ product: { dcs_dcs3: [{ resourceSpecCode: "redis.single.xu1.large.4", cloudServiceType: "c", resourceType: "r", spec: "S", planList: [{ billingMode: "ONDEMAND", productId: "p", amount: 1 }] }] } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildRedis({ service: "redis", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, spec: "redis.single.xu1.large.4" }, context);
  expect(card.rewriteValue).toMatchObject({ template_RENDER: { calculator_redis_bandwidth_switch: { UNSET_Stepper_0: { measureValue: 2 } } } });
});
