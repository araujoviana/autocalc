import { expect, test } from "bun:test";
import { CardInput } from "../../src/core/schemas.ts";
import { buildSfs } from "../../src/core/services/sfs.ts";

const context = { productInfo: async () => ({ product: { sfsturbo_sfsturbo: ["20MBps", "40MBps"].map(tier => ({ resourceSpecCode: `sfs.turbo.${tier}`, cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "YEARLY", productId: tier }] })) } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };

test("SFS rejects capacity rounded by the calculator form", () => {
  expect(CardInput.safeParse({ service: "sfsturbo", region: "r", size_gb: 500 }).success).toBe(false);
  expect(CardInput.parse({ service: "sfsturbo", region: "r" })).toMatchObject({ size_gb: 512 });
});

test.each([["20MBps", "calculator_sfsPeriod_36input"], ["40MBps", "calculator_sfsPeriod_12input"]])("SFS tier %s uses its own capacity control", async (tier, control) => {
  const input = CardInput.parse({ service: "sfsturbo", region: "r", size_gb: 1024, tier });
  if (input.service !== "sfsturbo") throw new Error();
  expect((await buildSfs(input, context)).rewriteValue).toMatchObject({ template_RENDER: { [control]: 1 } });
});
