import { expect, test } from "bun:test";
import { buildFunction } from "../../src/core/services/function.ts";
test("FunctionGraph uses millions of requests and GB-seconds", async () => {
  const context = { productInfo: async () => ({ product: { functionstage_functionstage: ["request", "compute"].map(factor => ({ resourceSpecCode: "functionstage", cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: factor, usageFactor: factor }] })) } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildFunction({ service: "function", region: "r", billing: "ondemand", quantity: 1, hours: 730, requests: 2000000, gb_seconds: 400000, memory_mb: 128, compute_units: 100, request_units: 100 }, context);
  expect(card.selectedProduct.productAllInfos).toMatchObject([{ usageValue: 2, usageMeasureId: 32 }, { usageValue: 400000, usageMeasureId: 39 }]);
});

test("FunctionGraph selects the first on-demand plan of each matched catalog item", async () => {
  const context = { productInfo: async () => ({ product: { functionstage_functionstage: [
    { resourceSpecCode: "functionstage", planList: [{ billingMode: "ONDEMAND", productId: "request-first", usageFactor: "other" }, { billingMode: "ONDEMAND", productId: "request-second", usageFactor: "request" }] },
    { resourceSpecCode: "functionstage", planList: [{ billingMode: "ONDEMAND", productId: "compute-first", usageFactor: "other" }, { billingMode: "ONDEMAND", productId: "compute-second", usageFactor: "compute" }] },
  ] } }), rate: async (body: Record<string, unknown>) => { const lines = body.productInfos as Array<{ id: string }>; return { productRatingResult: lines.map(({ id }) => ({ id, amount: 1 })) }; } };
  const card = await buildFunction({ service: "function", region: "r", billing: "ondemand", quantity: 1, hours: 730, requests: 1000000, gb_seconds: 400000, memory_mb: 128, compute_units: 100, request_units: 100 }, context);
  expect(card.selectedProduct.productAllInfos).toMatchObject([{ productId: "request-first", usageFactor: "request" }, { productId: "compute-first", usageFactor: "compute" }]);
});
