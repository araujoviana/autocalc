import { expect, test } from "bun:test";
import { buildDline } from "../../src/core/services/dline.ts";
import { buildApm } from "../../src/core/services/apm.ts";
import { buildCbr } from "../../src/core/services/cbr.ts";

test("simple builders select their catalog products and render controls", async () => {
  const context = {
    productInfo: async (service: string) => ({ product: Object.fromEntries([[{ dline: "dcaas_dcaas.port", apm: "apm_apm2.instance", cbr: "cbr_cbr.vault" }[service]!, [{ resourceSpecCode: { dline: "1ge", apm: "apm2.instance.normal", cbr: "vault.backup.server.normal" }[service], cloudServiceType: "c", resourceType: "r", planList: ["ONDEMAND", "MONTHLY", "YEARLY"].map(billingMode => ({ billingMode, productId: "p", amount: 1 })) }]]]) }),
    rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }),
  };
  const dline = await buildDline({ service: "dline", region: "r", billing: "monthly", quantity: 1, periods: 1, hours: 730, port: "1ge" }, context);
  expect(dline.rewriteValue).toMatchObject({ template_RENDER: { calculator_dline_radio: { portType: "dataInfo_1_" } } });
  const apm = await buildApm({ service: "apm", region: "r", billing: "ondemand", quantity: 1, hours: 730, spec: "apm2.instance.normal" }, context);
  expect(apm.selectedProduct).not.toHaveProperty("purchaseNum");
  const cbr = await buildCbr({ service: "cbr", region: "r", billing: "yearly", quantity: 1, periods: 1, hours: 730, vault_spec: "vault.backup.server.normal", size_gb: 100 }, context);
  expect(cbr.rewriteValue).toMatchObject({ template_RENDER: { calculator_cbr_type: { item: "calc_3_" } } });
});
