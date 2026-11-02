import { expect, test } from "bun:test";
import { compareCards } from "../support/golden.ts";
test("golden comparison ignores volatile IDs but detects product and rewrite changes", () => {
  const one = { selectedProduct: { timeTag: 1, _cartId: "a", productAllInfos: [{ resourceSpecCode: "x", inquiryResult: { id: "1", amount: 2 } }] }, rewriteValue: { field: 1 } };
  const two = { selectedProduct: { timeTag: 2, _cartId: "b", productAllInfos: [{ resourceSpecCode: "x", inquiryResult: { id: "2", amount: 2 } }] }, rewriteValue: { field: 1 } };
  expect(compareCards(one, two)).toEqual([]);
  expect(compareCards(one, { ...two, rewriteValue: { field: 2 } })).toContain("rewriteValue.field");
});

test("product comparison tolerates a cent of price drift but detects changed inputs", async () => {
  const { compareProducts } = await import("../support/golden.ts");
  const selected = { serviceCode: "evs", region: "r", chargeMode: "PERIOD", chargeModeName: "MONTHLY", periodType: 2, periodNum: 1, amount: 1, productAllInfos: [{ resourceSpecCode: "GPSSD", productNum: 1, inquiryResult: { amount: 1 } }] };
  const close = { ...selected, amount: 1.01, productAllInfos: [{ ...selected.productAllInfos[0], inquiryResult: { amount: 1.01 }, catalogNote: "changed" }] };
  expect(compareProducts(selected, close)).toEqual([]);
  expect(compareProducts(selected, { ...close, productAllInfos: [{ ...close.productAllInfos[0], productNum: 2 }] })).toContain("productAllInfos[0].productNum");
});
