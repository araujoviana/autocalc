import { expect, test } from "bun:test";
import { judge, allOk } from "../../src/core/edit-check.ts";

test("Edit deltas use Python-compatible six-decimal rounding", () => {
  expect(judge(0, { selectedProduct: { amount: 0, productAllInfos: [] } }, { productInfos: [] }, 0.0000005)).toMatchObject({ status: "ok", delta: 0 });
});
test("Edit comparison uses multisets and fails closed for invalid amounts", () => {
  const card = { selectedProduct: { amount: 10, productAllInfos: [{ resourceType: "type.vm", resourceSpecCode: "x", productNum: 1 }] } };
  const request = { productInfos: [{ resourceType: "type.vm", resourceSpecCode: "x", productNum: 1 }] };
  expect(judge(0, card, request, 10.005).status).toBe("ok");
  expect(judge(0, card, { productInfos: [] }, 10).status).toBe("mismatch");
  expect(judge(0, card, request, NaN).status).toBe("unavailable");
  expect(allOk([])).toBe(false);
});

test("OBS Edit detects changed usage even when amount is unchanged", () => {
  const card = { selectedProduct: { serviceCode: "obs", amount: 10, productAllInfos: [{ resourceType: "type.obs", resourceSpecCode: "obs.001", usageFactor: "size", usageValue: 100, usageMeasureId: 10, productNum: 720 }] } };
  const request = { productInfos: [{ resourceType: "type.obs", resourceSpecCode: "obs.001", usageFactor: "size", usageValue: 0, usageMeasureId: 10, productNum: 720 }] };
  expect(judge(0, card, request, 10)).toMatchObject({ status: "mismatch" });
});
