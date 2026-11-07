import { expect, test } from "bun:test";
import { CardInput } from "../../src/core/schemas.ts";
import { buildObs } from "../../src/core/services/obs.ts";

const FACTORS = {
  standard: ["size", "download.external", "get", "put", "delete"],
  warm: ["size_warm", "download_warm.external", "get_warm", "put_warm", "delete_warm", "retrieval_size_warm", "transition_warm"],
  cold: ["size_cold", "download_cold.external", "get_cold", "put_cold", "delete_cold", "restore_size_ex", "transition_cold"],
} as const;
const TOKEN = { standard: "dataInfo_2_", warm: "dataInfo_3_", cold: "dataInfo_1_" } as const;
// The builder fills every line the class shows, so the catalog needs all of them.
const EXTRA = { standard: ["download.cdn", "download_crr"], warm: ["download.cdn", "download_crr"], cold: ["download.cdn"] } as const;
const catalog = (cls: keyof typeof FACTORS) => [...FACTORS[cls], ...EXTRA[cls]].map(f => ({ resourceSpecCode: f === "download.cdn" ? "obs" : "obs.001", storageType: TOKEN[cls], cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: f, usageFactor: f }] }));
const ctx = (cls: keyof typeof FACTORS) => ({ productInfo: async () => ({ product: { obs_obs: catalog(cls) } }), rate: async (b: any) => ({ productRatingResult: b.productInfos.map(({ id }: any) => ({ id, amount: 0, originalAmount: 0 })) }) }) as any;

test.each(["standard", "warm", "cold"] as const)("%s: class and AZ are selected before any stepper is typed", async cls => {
  const components = FACTORS[cls].map(factor => ({ factor, value: 5, ...(factor.startsWith("size") ? { unit: "GB" as const } : {}) }));
  const input = CardInput.parse({ service: "obs", region: "sa-brazil-1", billing: "ondemand", storage_class: cls, components });
  if (input.service !== "obs") throw new Error();
  const render = ((await buildObs(input, ctx(cls))).rewriteValue as any).template_RENDER;
  expect(Object.keys(render).slice(0, 2)).toEqual(["calculator_productType_switch", "calculator_storageType_switch"]);
  expect(Object.keys(render.calculator_multiAZ_radio)[0]).toBe("multiAZType");
});

test("warm: delete goes to the delete control, transition to the transition control", async () => {
  const input = CardInput.parse({ service: "obs", region: "sa-brazil-1", billing: "ondemand", storage_class: "warm", components: [{ factor: "size_warm", value: 1, unit: "GB" }, { factor: "delete_warm", value: 63 }, { factor: "transition_warm", value: 85 }] });
  if (input.service !== "obs") throw new Error();
  const render = ((await buildObs(input, ctx("warm"))).rewriteValue as any).template_RENDER;
  expect(render.calculator_Request_stepper4.UNSET_Stepper_0).toMatchObject({ measureId: 31, measureValue: 63 });
  expect(render.calculator_Request_stepper5.UNSET_Stepper_0).toMatchObject({ measureId: 14, measureValue: 85 });
});
