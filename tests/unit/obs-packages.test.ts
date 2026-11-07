import { expect, test } from "bun:test";
import { CardInput } from "../../src/core/schemas.ts";
import { buildObs } from "../../src/core/services/obs.ts";

const sku = (code: string, extra: Record<string, unknown> = {}) => ({ resourceSpecCode: code, cloudServiceType: "c", resourceType: "r", storageType: "dataInfo_2_", obsStorageSize: "10dataInfo_19_", planList: [{ billingMode: "MONTHLY", productId: code, periodType: "month" }, { billingMode: "YEARLY", productId: code, periodType: "year" }], ...extra });
const catalog = [sku("obs.storage.10tb", { packageType: "dataInfo_9_" }), sku("obs.storage_3AZ.10tb", { packageType: "dataInfo_10_" }), sku("obs.storage_3AZ.100GB"), sku("obs.down.traffic.50gb", { packageType: "dataInfo_11_", obsDownTrafficSize: "50dataInfo_18_" }), sku("obs.down.traffic.1tb", { packageType: "dataInfo_11_", obsDownTrafficSize: "1dataInfo_19_" })];
const ctx = (items = catalog) => ({ productInfo: async () => ({ product: { obs_obs: items } }), rate: async (b: any) => ({ productRatingResult: b.productInfos.map(({ id }: any) => ({ id, amount: 0, originalAmount: 0 })) }) }) as any;
const parse = (extra: Record<string, unknown>) => { const r = CardInput.safeParse({ service: "obs", region: "ap-southeast-3", billing: "yearly", periods: 1, ...extra }); if (!r.success) throw new Error(r.error.issues[0]!.message); if (r.data.service !== "obs") throw new Error(); return r.data; };
const codes = async (extra: Record<string, unknown>, items?: any[]) => ((await buildObs(parse(extra), ctx(items))).selectedProduct.productAllInfos as any[]).map(p => p.resourceSpecCode);

test("an unknown package size is rejected by the schema", () => {
  expect(CardInput.safeParse({ service: "obs", region: "x", billing: "yearly", package: "7tb" }).success).toBe(false);
});
test("packages need Standard storage; traffic_package needs a package", () => {
  expect(() => parse({ package: "10tb", storage_class: "warm" })).toThrow("Standard storage only");
  expect(() => parse({ billing: "ondemand", components: [{ factor: "get", value: 1 }], traffic_package: "1tb" })).toThrow();
});
test("multi_az picks the multi-AZ package, with its package type", async () => {
  expect((await codes({ package: "10tb", multi_az: true }))[0]).toBe("obs.storage_3AZ.10tb");
  const card = await buildObs(parse({ package: "10tb", multi_az: true }), ctx());
  expect((card.rewriteValue as any).template_RENDER.calculator_Pack_checkboxGroup.packageType).toContain("dataInfo_10_");
  expect((card.rewriteValue as any).template_RENDER.calculator_multiAZPack_radio).toBeDefined();
});
test("the 3-AZ GB packages are matched whatever the catalog's letter case", async () => {
  expect((await codes({ package: "100gb", multi_az: true }))[0]).toBe("obs.storage_3AZ.100GB");
});
test("traffic package: 50 GB by default where sold, chosen size, none, or error when not sold", async () => {
  expect(await codes({ package: "10tb" })).toEqual(["obs.storage.10tb", "obs.down.traffic.50gb"]);
  expect(await codes({ package: "10tb", traffic_package: "1tb" })).toEqual(["obs.storage.10tb", "obs.down.traffic.1tb"]);
  expect(await codes({ package: "10tb", traffic_package: "none" })).toEqual(["obs.storage.10tb"]);
  expect(await codes({ package: "10tb" }, catalog.slice(0, 1))).toEqual(["obs.storage.10tb"]);
  await expect(codes({ package: "10tb", traffic_package: "10tb" })).rejects.toThrow("not sold");
});
test("a package the region does not sell is SPEC_NOT_FOUND", async () => {
  await expect(codes({ package: "20tb" })).rejects.toThrow("package not found");
});
