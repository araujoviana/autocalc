import { expect, test } from "bun:test";
import { buildApig } from "../../src/core/services/apig.ts";

test("builds API Gateway card with catalog selection and render state", async () => {
  const card = await buildApig({ service: "apig", region: "r", billing: "ondemand", edition: "BASIC", quantity: 1, periods: 1, hours: 730 }, {
    productInfo: async () => ({ product: { "apig_apig.instance": [{ resourceSpecCode: "BASIC", cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: "p", amount: 2 }] }] } }),
    rate: async body => ({ productRatingResult: [{ id: (body.productInfos as Array<{ id: string }>)[0]!.id, amount: 2, originalAmount: 2 }] }),
  });
  expect(card.selectedProduct).toMatchObject({ serviceCode: "apig", amount: 2 });
  expect(card.rewriteValue).toMatchObject({ template_RENDER: { calculator_spec_radioGroups: { type: "dataInfo_1_" } } });
  expect(card.selectedProduct).not.toHaveProperty("purchaseNum");
});
