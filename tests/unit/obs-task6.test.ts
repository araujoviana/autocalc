import { expect, test } from "bun:test";
import { CardInput } from "../../src/core/schemas.ts";
import { buildObs } from "../../src/core/services/obs.ts";

const plan = [{ billingMode: "ONDEMAND", productNum: 1, amount: 0 }];
const sku = (usageFactor: string, storageType: string, extra: Record<string, unknown> = {}) => ({ resourceSpecCode: usageFactor === "download.cdn" ? "obs" : "obs.001", storageType, cloudServiceType: "c", resourceType: "r", planList: [{ ...plan[0], usageFactor }], ...extra });
const STD = ["size", "download.external", "download.cdn", "download_crr", "get", "put", "delete"];
const WARM = ["size_warm", "download_warm.external", "download.cdn", "download_crr", "get_warm", "put_warm", "delete_warm", "retrieval_size_warm", "transition_warm"];
const all = (factors: string[], token: string) => factors.map(f => sku(f, token));
const ctx = (items: unknown[]) => ({ productInfo: async () => ({ product: { obs_obs: items } }), rate: async (b: any) => ({ productRatingResult: b.productInfos.map(({ id }: any) => ({ id, amount: 0, originalAmount: 0 })) }) }) as any;
const parse = (o: Record<string, unknown>) => { const i = CardInput.parse({ service: "obs", region: "sa-brazil-1", billing: "ondemand", ...o }); if (i.service !== "obs") throw new Error(); return i; };

test("months scales the size line and the duration stepper", async () => {
  const card = await buildObs(parse({ months: 3, components: [{ factor: "size", value: 5, unit: "GB" }] }), ctx(all(STD, "dataInfo_2_")));
  expect((card.selectedProduct.productAllInfos as any[])[0].productNum).toBe(2160);
  expect(JSON.stringify(card.rewriteValue)).toContain('"measureValue":3');
});

test("months is rejected outside pay-per-use", () => {
  expect(CardInput.safeParse({ service: "obs", region: "r", billing: "monthly", package: "1tb", months: 2 }).success).toBe(false);
});

test("cold restore type picks the page's restore radio", async () => {
  const items = ["size_cold", "download_cold.external", "get_cold", "put_cold", "delete_cold", "restore_size_sd", "transition_cold", "download.cdn"].map(f => sku(f, "dataInfo_1_"));
  const card = await buildObs(parse({ storage_class: "cold", components: [{ factor: "size_cold", value: 5, unit: "GB" }, { factor: "restore_size_sd", value: 7 }] }), ctx(items));
  const text = JSON.stringify(card.rewriteValue);
  expect(text).toContain("dataInfo_7_");
  expect(text).not.toContain("dataInfo_6_");
});

test("class token comes from the catalog (ru-moscow-1 names)", async () => {
  const card = await buildObs(parse({ storage_class: "warm", components: [{ factor: "size_warm", value: 5, unit: "GB" }] }), ctx(all(WARM, "dataInfo_25_")));
  expect(((card.rewriteValue as any).template_RENDER.calculator_storageType_switch)).toEqual({ storageType: "dataInfo_25_" });
});

