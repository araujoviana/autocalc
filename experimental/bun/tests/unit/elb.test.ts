import { expect, test } from "bun:test";
import { buildElb } from "../../src/core/services/elb.ts";
test("ELB on-demand has two products and an IP stepper without transfer fields", async () => {
  const context = { productInfo: async () => ({ product: { elb_elbv2: ["elbv2.basic.default", "21_instance"].map(resourceSpecCode => ({ resourceSpecCode, cloudServiceType: "c", resourceType: "r", elbType: "shared", planList: [{ billingMode: "ONDEMAND", productId: resourceSpecCode, amount: 1 }] })) } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildElb({ service: "elb", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, public_ip_count: 2 }, context);
  expect(card.selectedProduct.amount).toBe(2);
  const ip = ((card.rewriteValue.template_RENDER as Record<string, unknown>).calculator_ip as { UNSET_Stepper_0: Record<string, unknown> }).UNSET_Stepper_0;
  expect(ip).toMatchObject({ measureId: 14, measureValue: 2 });
  expect(ip).not.toHaveProperty("transRate");
});

test("ELB preserves null usage factors from the selected catalog plans", async () => {
  let factors: unknown[] = [];
  const context = { productInfo: async () => ({ product: { elb_elbv2: ["elbv2.basic.default", "21_instance"].map(resourceSpecCode => ({ resourceSpecCode, cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: resourceSpecCode, amount: 1, usageFactor: null }] })) } }), rate: async (body: Record<string, unknown>) => { const lines = body.productInfos as Array<{ id: string; usageFactor: unknown }>; factors = lines.map(line => line.usageFactor); return { productRatingResult: lines.map(({ id }) => ({ id, amount: 1 })) }; } };
  await buildElb({ service: "elb", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, public_ip_count: 2 }, context);
  expect(factors).toEqual([null, null]);
});
