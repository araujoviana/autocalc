import { expect, test } from "bun:test";
import { standardObsCatalog } from "../support/obs-catalog.ts";
import { buildObs } from "../../src/core/services/obs.ts";
test("OBS storage uses 720 multiplier and component-specific form state", async () => {
  const context = { productInfo: async () => ({ product: { obs_obs: standardObsCatalog() } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildObs({ service: "obs", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, storage_class: "standard", multi_az: false, components: [{ factor: "size", value: 2, unit: "TB" }] }, context);
  expect((card.selectedProduct.productAllInfos as Record<string, unknown>[])[0]).toMatchObject({ productNum: 720, usageMeasureId: 9 });
  expect(card.rewriteValue).toMatchObject({ template_RENDER: { calculator_multiAZ_radio: { UNSET_Stepper_0: { measureValue: 2 }, multiAZType: "dataInfo_4_" } } });
});
