import { expect, test } from "bun:test";
import { buildEvs } from "../../src/core/services/evs.ts";

test("GPSSD2 bills only IOPS and throughput above included baselines", async () => {
  const skus = ["GPSSD2.storage", "GPSSD2.iops", "GPSSD2.throughput"].map(resourceSpecCode => ({ resourceSpecCode, cloudServiceType: "c", resourceType: "disk", productType: "disk", planList: [{ billingMode: "ONDEMAND", productId: resourceSpecCode, amount: 1, measureUnit: 75 }] }));
  const context = { productInfo: async () => ({ product: { ebs_volume: skus } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildEvs({ service: "evs", region: "r", billing: "ondemand", quantity: 2, periods: 1, hours: 10, type: "GPSSD2", size_gb: 100, iops: 3500, throughput: 150 }, context);
  const products = card.selectedProduct.productAllInfos as Array<Record<string, unknown>>;
  expect(products[1]).toMatchObject({ usageValue: 500, productNum: 20 });
  expect(products[2]).toMatchObject({ usageValue: 25, productNum: 20 });
  expect(card.selectedProduct.purchaseNum).toMatchObject({ measureNameBeforeTrans: "calc_5_", measurePluralNameBeforeTrans: "calc_6_" });
});
