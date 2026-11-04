import { expect, test } from "bun:test";
import { buildCci } from "../../src/core/services/cci.ts";
test("CCI emits CPU and memory lines and dedicated time state", async () => {
  const context = { productInfo: async () => ({ product: { "cci_container.instance": ["cci.container.cpu", "cci.container.mem"].map(resourceSpecCode => ({ resourceSpecCode, cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: resourceSpecCode }] })) } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildCci({ service: "cci", region: "r", billing: "ondemand", hours: 730, vcpu: 2, mem_gb: 4 }, context);
  expect(card.selectedProduct).toMatchObject({ amount: 2, purchaseTime: { measureNameBeforeTrans: "detail_107_" } });
  expect(card.rewriteValue).toMatchObject({ template_RENDER: { calculator_vCPUs_stepper: { UNSET_Stepper_0: { measureValue: 2 } }, calculator_mem_stepper: { UNSET_Stepper_0: { measureValue: 4 } } } });
});
