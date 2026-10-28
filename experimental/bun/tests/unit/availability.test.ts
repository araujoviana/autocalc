import { expect, test } from "bun:test";
import { checkAvailability } from "../../src/core/availability.ts";
import { selectProduct } from "../../src/core/services/common.ts";

test("missing catalog specs include nearest alternatives", async () => {
  const context = { productInfo: async () => ({ product: { group: ["z.other", "c7.large", "c7.medium", "c6.small", "c7.small", "c7.xlarge"].map(resourceSpecCode => ({ resourceSpecCode })) } }), rate: async () => ({}) };
  await expect(selectProduct(context, "ecs", "r", "group", "c7.smallx", "monthly", 730)).rejects.toMatchObject({ code: "SPEC_NOT_FOUND", details: { spec: "c7.smallx", region: "r", group: "group", nearest: ["c7.medium", "c7.xlarge", "c7.large", "c7.small", "c6.small"] } });
});
test("availability rejects unsold regions and unoffered modes", () => {
  const menu = { menuInfos: [{ subCategoryLists: [{ urlPath: "ecs", regionOnline: { regionList: ["r"], r: { common: ["PERIOD"] } } }] }] };
  expect(() => checkAvailability(menu, "ecs", "r", "monthly")).not.toThrow();
  expect(() => checkAvailability(menu, "ecs", "r", "ondemand")).toThrow();
  expect(() => checkAvailability(menu, "ecs", "elsewhere", "monthly")).toThrow();
});
