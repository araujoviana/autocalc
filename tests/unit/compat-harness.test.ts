import { expect, test } from "bun:test";
import { diffProducts } from "../support/compat/harness.ts";

test("equal products produce no diff, including null versus undefined", () => {
  const a = [{ usageFactor: "get", usageValue: 10, usageMeasureId: 54, productNum: 1 }, { resourceSpecCode: "obs.storage.10tb", productNum: 1 }];
  const b = [{ usageFactor: "get", usageValue: "10", usageMeasureId: 54, productNum: 1 }, { resourceSpecCode: "obs.storage.10tb", usageValue: null, productNum: 1 }];
  expect(diffProducts(a, b)).toEqual([]);
});

test("a swapped value, a missing line and an extra line are all reported", () => {
  const built = [{ usageFactor: "delete_warm", usageValue: 63, usageMeasureId: 31, productNum: 1 }, { usageFactor: "put_warm", usageValue: 5, usageMeasureId: 31, productNum: 1 }];
  const page = [{ usageFactor: "delete_warm", usageValue: 0, usageMeasureId: 31, productNum: 1 }, { usageFactor: "get_warm", usageValue: 1, usageMeasureId: 31, productNum: 1 }];
  expect(diffProducts(built, page).map(d => d.key).sort()).toEqual(["delete_warm", "get_warm", "put_warm"]);
});
