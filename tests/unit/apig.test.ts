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

test("API Gateway includes public outbound bandwidth product when bandwidth_mbps > 0", async () => {
  const card = await buildApig({ service: "apig", region: "r", billing: "ondemand", edition: "BASIC", bandwidth_mbps: 10, quantity: 1, periods: 1, hours: 730 }, {
    productInfo: async () => ({
      product: {
        "apig_apig.instance": [{ resourceSpecCode: "BASIC", cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: "p1", amount: 2 }] }],
        "apig_apig.publicip": [{ resourceSpecCode: "publicip", cloudServiceType: "c", resourceType: "eip", planList: [{ billingMode: "ONDEMAND", productId: "p2", amount: 1 }] }],
      },
    }),
    rate: async body => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: id.endsWith("-p1") ? 2 : 1, originalAmount: id.endsWith("-p1") ? 2 : 1 })) }),
  });
  const products = card.selectedProduct.productAllInfos as Array<Record<string, unknown>>;
  expect(products).toHaveLength(2);
  expect(products[1]).toMatchObject({ resourceSpecCode: "publicip", resourceSize: 10 });
  expect(card.selectedProduct).toMatchObject({ amount: 3 });
  expect(card.rewriteValue).toMatchObject({
    template_RENDER: {
      calculator_bandwidth_switch: { UNSET_Switch: "dataInfo_5_" },
      calculator_bandwidth_stepper: { UNSET_Stepper_0: { measureValue: 10 } },
    },
  });
});
