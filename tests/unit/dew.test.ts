import { expect, test } from "bun:test";
import { buildDew } from "../../src/core/services/dew.ts";
test("DEW validates matching KMS/CSMS products and renders key usage", async () => {
  const context = { productInfo: async () => ({ product: { kms_kms: ["kms.ud.customer", "kms.api"].map(resourceSpecCode => ({ resourceSpecCode, cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: resourceSpecCode }] })) } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const input = { service: "dew" as const, region: "r", billing: "ondemand" as const, quantity: 1, hours: 730, keys: 2, api_requests: 1, days: 30, storage_spec: "kms.ud.customer", api_spec: "kms.api" };
  const card = await buildDew(input, context);
  expect(card.selectedProduct.productAllInfos).toMatchObject([{ usageValue: 1460 }, { usageValue: 1 }]);
  await expect(buildDew({ ...input, storage_spec: "csms.secret.storage" }, context)).rejects.toThrow();
});
