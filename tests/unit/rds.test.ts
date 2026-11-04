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

test("RDS without storage_spec picks the engine's Cloud SSD volume, else its common volume, else asks", async () => {
  const planList = [{ billingMode: "ONDEMAND", productId: "p", amount: 1 }];
  const vol = (code: string) => ({ resourceSpecCode: code, cloudServiceType: "c", resourceType: "v", type: code, planList });
  const make = (volumes: string[]) => ({
    productInfo: async () => ({ product: { "rds_rds.vm": [{ resourceSpecCode: "rds.mysql.n1.large.4", cloudServiceType: "c", resourceType: "vm", cpu: "2", mem: "4", planList }], "rds_rds.volume": volumes.map(vol) } }),
    rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }),
  });
  const input = { service: "rds" as const, region: "r", billing: "ondemand" as const, quantity: 1, periods: 1, hours: 730, flavor: "rds.mysql.n1.large.4", storage_gb: 40 };
  const both = await buildRds(input, make(["rds.mysql.volume.gpssd2", "rds.mysql.volume.common", "rds.mysql.volume.cloudssd"]));
  expect(both.rewriteValue).toMatchObject({ template_RENDER: { calculator_rdsvolume_stepper: { type: "rds.mysql.volume.cloudssd" } } });
  const common = await buildRds(input, make(["rds.mysql.volume.common"]));
  expect(common.rewriteValue).toMatchObject({ template_RENDER: { calculator_rdsvolume_stepper: { type: "rds.mysql.volume.common" } } });
  await expect(buildRds(input, make(["rds.pg.volume.common"]))).rejects.toThrow("No default volume for engine 'mysql'");
});
