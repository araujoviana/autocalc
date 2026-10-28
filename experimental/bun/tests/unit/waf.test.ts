import { expect, test } from "bun:test";
import { buildWaf } from "../../src/core/services/waf.ts";
test("WAF rates domains, rules, and request count with separate durations", async () => {
  const entries = [["waf_waf.payperusedomain", "waf.payperuse.domain"], ["waf_waf.payperuserule", "waf.payperuse.rule"], ["waf_waf.payperuserequest", "waf.payperuse.request"]] as const;
  const context = { productInfo: async () => ({ product: Object.fromEntries(entries.map(([group, spec]) => [group, [{ resourceSpecCode: spec, cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: spec, amount: 1 }] }]])) }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildWaf({ service: "waf", region: "r", billing: "ondemand", quantity: 1, hours: 730, domains: 1, rules: 2, requests: 2000000 }, context);
  expect(card.selectedProduct.amount).toBe(3);
  expect(card.rewriteValue).toMatchObject({ template_RENDER: { calculator_waf_requestOndemandStepper: { UNSET_Stepper_0: { measureValue: 2 } } } });
});
