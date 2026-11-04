import { expect, test } from "bun:test";
import { assembleCard, productFromCatalog, rateProducts } from "../../src/core/cards.ts";

test("copies vendor data and flattens the chosen plan without mutating catalog", () => {
  const catalog = { resourceSpecCode: "sku", custom: 42, planList: [
    { billingMode: "MONTHLY", productId: "m", periodNum: 1, amount: 0 },
    { billingMode: "YEARLY", productId: "y", periodNum: 1, amount: 4 },
  ] };
  const result = productFromCatalog(catalog, "monthly", 730);
  expect(result.productId).toBe("m");
  expect(result.amount).toBe(0);
  expect(result.custom).toBe(42);
  expect(result.bakPlanList).toHaveLength(2);
  expect(catalog.planList).toHaveLength(2);
});

test("assembles a rated card with calculated totals and render state", async () => {
  const card = await assembleCard({ service: "apig", region: "r", billing: "monthly", quantity: 2, periods: 1, hours: 730, description: "API", rewrite: { setting: true }, products: [{ productId: "p", cloudServiceType: "c", resourceType: "r", resourceSpecCode: "s" }] }, async body => {
    const id = (body.productInfos as Array<{ id: string }>)[0]!.id;
    return { productRatingResult: [{ id, amount: 4, originalAmount: 5 }] };
  });
  expect(card.selectedProduct).toMatchObject({ serviceCode: "apig", amount: 4, originalAmount: 5, purchaseNum: { measureValue: 2 } });
  expect(card.rewriteValue).toMatchObject({ template_RENDER: { setting: true }, global_PERIODTIME: { UNSET_PeriodTime: { measureValue: 1, measureId: 20 } } });
});

test("rates selected products and retains zero original amount", async () => {
  const products: Record<string, unknown>[] = [{ selectIndex: 0, productId: "p", resourceType: "r", cloudServiceType: "c", resourceSpecCode: "s", productNum: 1, inquiryTag: "normal" }];
  await rateProducts(products, "r", "monthly", 1, 100, async body => {
    expect(body).toMatchObject({ chargingMode: 0, periodType: 2, periodNum: 1, productInfos: [{ id: "100-0-p" }] });
    return { productRatingResult: [{ id: "100-0-p", amount: 3, originalAmount: 0 }] };
  });
  expect(products[0]?.inquiryResult).toMatchObject({ amount: 3, originalAmount: 0 });
});
