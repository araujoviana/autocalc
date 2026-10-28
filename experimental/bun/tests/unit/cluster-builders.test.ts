import { expect, test } from "bun:test";
import { buildNat } from "../../src/core/services/nat.ts";
import { buildCce } from "../../src/core/services/cce.ts";
import { buildSfs } from "../../src/core/services/sfs.ts";
import { buildCbr } from "../../src/core/services/cbr.ts";

test("NAT, CCE and SFS retain their service-specific form state", async () => {
  const context = {
    productInfo: async (service: string) => ({ product: Object.fromEntries([[{ nat: "natgateway_natgateway", cce: "cce_cce.cluster", sfsturbo: "sfsturbo_sfsturbo" }[service]!, [{ resourceSpecCode: { nat: "natgateway_small", cce: "cce.s2.small", sfsturbo: "sfs.turbo.20MBps" }[service], cloudServiceType: "c", resourceType: "r", planList: ["ONDEMAND", "YEARLY"].map(billingMode => ({ billingMode, productId: "p", amount: 1 })) }]]]) }),
    rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }),
  };
  const nat = await buildNat({ service: "nat", region: "r", billing: "ondemand", quantity: 1, hours: 730, size: "small" }, context);
  expect(nat.rewriteValue).toMatchObject({ global_ONDEMANDTIME: { UNSET_Stepper_0: { measureId: 0 } } });
  const cce = await buildCce({ service: "cce", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "standard", ha: true, scale: "small" }, context);
  expect(cce.rewriteValue).toMatchObject({ global_QUANTITY: { UNSET_Stepper_0: { measureNameBeforeTrans: "" } } });
  expect(cce.selectedProduct.purchaseNum).toMatchObject({ measureNameBeforeTrans: "", measurePluralNameBeforeTrans: "" });
  const sfs = await buildSfs({ service: "sfsturbo", region: "r", billing: "yearly", quantity: 1, periods: 1, hours: 730, tier: "20MBps", size_gb: 500 }, context);
  expect(sfs.rewriteValue).toMatchObject({ template_RENDER: { calculator_sfsPeriod_36input: 0.5 } });
});

test("CCE preserves an explicitly null catalog usage factor", async () => {
  let factor: unknown = "unseen";
  const context = {
    productInfo: async () => ({ product: { "cce_cce.cluster": [{ resourceSpecCode: "cce.s2.small", cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: "p", amount: 1, usageFactor: null }] }] } }),
    rate: async (body: Record<string, unknown>) => { const line = (body.productInfos as Array<Record<string, unknown>>)[0]!; factor = line.usageFactor; return { productRatingResult: [{ id: line.id, amount: 1 }] }; },
  };
  await buildCce({ service: "cce", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "standard", ha: true, scale: "small" }, context);
  expect(factor).toBeNull();
});

test("CBR preserves an explicitly null catalog usage factor", async () => {
  let factor: unknown = "unseen";
  const context = {
    productInfo: async () => ({ product: { "cbr_cbr.vault": [{ resourceSpecCode: "vault.backup.server.normal", cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: "p", amount: 1, usageFactor: null }] }] } }),
    rate: async (body: Record<string, unknown>) => { const line = (body.productInfos as Array<Record<string, unknown>>)[0]!; factor = line.usageFactor; return { productRatingResult: [{ id: line.id, amount: 1 }] }; },
  };
  await buildCbr({ service: "cbr", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, vault_spec: "vault.backup.server.normal", size_gb: 100 }, context);
  expect(factor).toBeNull();
});
