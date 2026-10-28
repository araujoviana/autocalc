import { expect, test } from "bun:test";
import { buildRds } from "../../src/core/services/rds.ts";

test("RDS card combines VM and storage and keeps version override", async () => {
  const planList = [{ billingMode: "ONDEMAND", productId: "p", amount: 1 }];
  const context = { productInfo: async () => ({ product: { "rds_rds.vm": [{ resourceSpecCode: "vm", cloudServiceType: "c", resourceType: "vm", cpu: "4BSSUNIT.pluralUnit.23", mem: "8BSSUNIT.pluralUnit.17", planList }], "rds_rds.volume": [{ resourceSpecCode: "disk", cloudServiceType: "c", resourceType: "disk", type: "SSD", planList }] } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildRds({ service: "rds", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, flavor: "vm", storage_spec: "disk", storage_gb: 40, db_version: "8" }, context);
  expect(card.selectedProduct).toMatchObject({ amount: 2 });
  expect(card.selectedProduct.purchaseNum).toMatchObject({ measureNameBeforeTrans: "", measurePluralNameBeforeTrans: "" });
  expect(card.rewriteValue).toMatchObject({ template_RENDER: { calculator_rdsvm_radio: { dbVersion: "8" }, calculator_rdsvolume_stepper: { type: "SSD", UNSET_Stepper_0: { measureValue: 40 } } } });
});
