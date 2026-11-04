import { expect, test } from "bun:test";
import { scanNonfinite, validateList } from "../../src/core/validate.ts";

test("detects nonfinite placeholders and mismatched totals", () => {
  expect(scanNonfinite({ a: ["NaN", Infinity, false] })).toHaveLength(2);
  const result = validateList({ totalPrice: 20, cartListData: [{ selectedProduct: { region: "r", chargeMode: "PERIOD", chargeModeName: "MONTHLY", serviceCode: "x", originalAmount: 10, amount: 10, productAllInfos: [{ resourceSpecCode: "a", resourceType: "t", productNum: 1, inquiryTag: 1, selectIndex: 0, addToList_product: "x", inquiryResult: { amount: 10, originalAmount: 10 } }] } }] });
  expect(result.ok).toBe(false);
  expect(result.issues.some(issue => issue.includes("totalPrice"))).toBe(true);
});

test("rejects invalid selected money and product indices even when fields exist", () => {
  const result = validateList({ cartListData: [{ selectedProduct: { region: "r", chargeMode: "PERIOD", chargeModeName: "MONTHLY", serviceCode: "x", originalAmount: null, amount: 10, productAllInfos: [{ resourceSpecCode: "a", resourceType: "t", productNum: 1, inquiryTag: "normal", selectIndex: "bad", addToList_product: "x", inquiryResult: { amount: 10, originalAmount: 10 } }] } }] });
  expect(result.ok).toBe(false);
  expect(result.issues.some(issue => issue.includes("originalAmount") && issue.includes("invalid"))).toBe(true);
  expect(result.issues.some(issue => issue.includes("selectIndex"))).toBe(true);
});

test("requires ECS bandwidth to select the public-IP form state", () => {
  const result = validateList({ cartListData: [{ rewriteValue: { template_RENDER: { calculator_eip_switch: { UNSET_Switch: "unexpected" }, calculator_eip_radio: {} } }, selectedProduct: { region: "r", chargeMode: "PERIOD", chargeModeName: "MONTHLY", serviceCode: "ecs", originalAmount: 0, amount: 0, productAllInfos: [{ resourceSpecCode: "a", resourceType: "hws.resource.type.bandwidth", productNum: 1, inquiryTag: "normal", selectIndex: 0, addToList_product: "x", inquiryResult: { amount: 0, originalAmount: 0 } }] } }] });
  expect(result.ok).toBe(false);
  expect(result.issues.some(issue => issue.includes("bandwidth product"))).toBe(true);
});

test("RI selected-level money aggregates must be finite", () => {
  const result = validateList({ cartListData: [{ selectedProduct: { region: "r", chargeMode: "RI", chargeModeName: "RI", serviceCode: "x", originalAmount: 0, amount: 0, perAmount: null, installAmount: 0, perDiscountAmount: 0, perOriginalAmount: 0, productAllInfos: [{ resourceSpecCode: "a", resourceType: "t", productNum: 1, inquiryTag: "normal", selectIndex: 0, addToList_product: "x", inquiryResult: { amount: 0, originalAmount: 0 } }] } }] });
  expect(result.ok).toBe(false);
  expect(result.issues.some(issue => issue.includes("perAmount"))).toBe(true);
});

test("validation total uses Python-compatible six-decimal rounding", () => {
  const amount = 0.0000005;
  const result = validateList({ cartListData: [{ selectedProduct: { region: "r", chargeMode: "PERIOD", chargeModeName: "MONTHLY", serviceCode: "x", originalAmount: amount, amount, productAllInfos: [{ resourceSpecCode: "a", resourceType: "t", productNum: 1, inquiryTag: "normal", selectIndex: 0, addToList_product: "x", inquiryResult: { amount, originalAmount: amount } }] } }] });
  expect(result).toMatchObject({ ok: true, total: 0 });
});
