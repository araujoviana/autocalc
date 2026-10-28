import { expect, test } from "bun:test";
import { CardInput } from "../../src/core/schemas.ts";
import { mapUpstreamError } from "../../src/core/errors.ts";
import { readPriceList } from "../../src/core/lists.ts";
import { standardObsCatalog } from "../support/obs-catalog.ts";
import { buildObs } from "../../src/core/services/obs.ts";

const base = { service: "obs", region: "r" };
test("OBS requires units for capacity and rejects conflicting AZ and class", () => {
  expect(CardInput.safeParse({ ...base, components: [{ factor: "size", value: 1 }] }).success).toBe(false);
  expect(CardInput.safeParse({ ...base, multi_az: true, components: [{ factor: "size", value: 1, unit: "GB" }] }).success).toBe(false);
  expect(CardInput.safeParse({ ...base, components: [{ factor: "size_3az", value: 1, unit: "GB" }] }).success).toBe(false);
  expect(CardInput.safeParse({ ...base, storage_class: "warm", multi_az: true, components: [{ factor: "size_3az", value: 1, unit: "GB" }] }).success).toBe(false);
  expect(CardInput.safeParse({ ...base, components: [{ factor: "get", value: 1 }] }).success).toBe(true);
});

test("multi-AZ storage rates GB measure while preserving the displayed TB and stepper", async () => {
  const input = CardInput.parse({ ...base, multi_az: true, components: [{ factor: "size_3az", value: 2, unit: "TB" }] });
  if (input.service !== "obs") throw new Error();
  const context = { productInfo: async () => ({ product: { obs_obs: standardObsCatalog("size_3az") } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildObs(input, context);
  expect((card.selectedProduct.productAllInfos as Record<string, unknown>[])[0]).toMatchObject({ usageMeasureId: 17, usageValue: 2048, usageFactor: "size_3az" });
  expect(card.rewriteValue).toMatchObject({ template_RENDER: { calculator_multiAZ_radio: { UNSET_Stepper_1: { measureValue: 2 }, multiAZType: "dataInfo_5_" } } });
});

test("read-back includes usage-billed values", async () => {
  const reader = { getUncached: async () => ({ retCode: 200, data: { cartListData: [{ selectedProduct: { productAllInfos: [{ usageFactor: "size", usageValue: 3, usageMeasureId: 17 }] } }] } }) };
  expect(await readPriceList(reader, "abc")).toMatchObject({ items: [{ products: [{ usageFactor: "size", usageValue: 3, usageMeasureId: 17 }] }] });
});

test("CBC.6050 carries a specific error", () => {
  expect(mapUpstreamError("CBC.6050").toJSON()).toMatchObject({ error: "UPSTREAM", details: { exceptionId: "CBC.6050" } });
  expect(mapUpstreamError("CBC.6050").message).not.toBe("Upstream request failed");
});

test("OBS without capacity preserves the requested availability zone", async () => {
  const input = CardInput.parse({ ...base, multi_az: true, components: [{ factor: "get", value: 1 }] });
  if (input.service !== "obs") throw new Error();
  const context = { productInfo: async () => ({ product: { obs_obs: standardObsCatalog("size_3az") } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildObs(input, context);
  expect(card.rewriteValue).toMatchObject({ template_RENDER: { calculator_multiAZ_radio: { multiAZType: "dataInfo_5_" } } });
});

test("OBS card ordering keeps non-OBS positions and groups capacity-free then zero and nonzero download", async () => {
  const { orderObsCards } = await import("../../src/core/actions.ts");
  const items = [
    { service: "obs", components: [{ factor: "size", value: 1 }, { factor: "download.external", value: 8 }] },
    { service: "ecs" },
    { service: "obs", components: [{ factor: "size", value: 1 }] },
    { service: "obs", components: [{ factor: "get", value: 4 }] },
  ];
  expect(orderObsCards(items, ["download", "ecs", "zero", "capacity-free"])).toEqual(["capacity-free", "ecs", "zero", "download"]);
});

test("OBS card fills absent standard template lines with zero usage", async () => {
  const input = CardInput.parse({ ...base, components: [{ factor: "get", value: 3 }] });
  if (input.service !== "obs") throw new Error();
  const factors = ["size", "download.external", "download.cdn", "download_crr", "get", "put", "delete"];
  const catalog = factors.map(factor => ({ resourceSpecCode: factor === "download.cdn" ? "obs" : "obs.001", storageType: "dataInfo_2_", cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: factor, usageFactor: factor }] }));
  const context = { productInfo: async () => ({ product: { obs_obs: catalog } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 0, originalAmount: 0 })) }) };
  const card = await buildObs(input, context);
  expect((card.selectedProduct.productAllInfos as Record<string, unknown>[]).map((p: Record<string, unknown>) => [p.usageFactor, p.usageValue])).toEqual(expect.arrayContaining([["get", 3], ["download.external", 0], ["size", 0]]));
});

test.each([
  ["standard", false, "size", "dataInfo_2_", "UNSET_Stepper_0", 10, ["download.external", "download.cdn", "download_crr", "get", "put", "delete"]],
  ["standard", true, "size_3az", "dataInfo_2_", "UNSET_Stepper_1", 17, ["download.external", "download.cdn", "download_crr", "get", "put", "delete"]],
  ["warm", false, "size_warm", "dataInfo_3_", "UNSET_Stepper_0", 10, ["download_warm.external", "download.cdn", "download_crr", "get_warm", "put_warm", "delete_warm", "retrieval_size_warm", "transition_warm"]],
  ["warm", true, "size_warm_3az", "dataInfo_3_", "UNSET_Stepper_1", 17, ["download_warm.external", "download.cdn", "download_crr", "get_warm", "put_warm", "delete_warm", "retrieval_size_warm", "transition_warm"]],
  ["cold", false, "size_cold", "dataInfo_1_", "UNSET_Stepper_0", 10, ["download_cold.external", "download.cdn", "get_cold", "put_cold", "delete_cold", "restore_size_ex", "transition_cold"]],
] as const)("OBS storage shape %s multi-AZ=%s", async (storage_class, multi_az, factor, token, step, measure, rest) => {
  const input = CardInput.parse({ ...base, storage_class, multi_az, components: [{ factor, value: 100, unit: "GB" }] });
  if (input.service !== "obs") throw new Error();
  const catalog = [factor, ...rest].map(usageFactor => ({ resourceSpecCode: usageFactor === "download.cdn" ? "obs" : "obs.001", storageType: token, cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: usageFactor, usageFactor }] }));
  const context = { productInfo: async () => ({ product: { obs_obs: catalog } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 0, originalAmount: 0 })) }) };
  const card = await buildObs(input, context);
  expect((card.selectedProduct.productAllInfos as Record<string, unknown>[])[0]).toMatchObject({ usageFactor: factor, usageValue: 100, usageMeasureId: measure });
  expect(card.rewriteValue).toMatchObject({ template_RENDER: { calculator_multiAZ_radio: { [step]: { measureValue: 100 }, multiAZType: multi_az ? "dataInfo_5_" : "dataInfo_4_" } } });
});
