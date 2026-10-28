import { expect, test } from "bun:test";
import { buildLts } from "../../src/core/services/lts.ts";
test("LTS preserves product order and 720 storage display divisor", async () => {
  const entries = [["lts_lts.logflow", "lts.log.flow"], ["lts_lts.logindex", "lts.log.index"], ["lts_lts.logstorage", "lts.log.storage.cold"], ["lts_lts.logstorage", "lts.log.storage"], ["lts_lts.logtransfer", "lts.log.transfer.basic"], ["lts_lts.logtransfer", "lts.log.transfer.senior"]];
  const groups: Record<string, Record<string, unknown>[]> = {};
  for (const [group, spec] of entries) (groups[group!] ??= []).push({ resourceSpecCode: spec, cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: spec }] });
  const context = { productInfo: async () => ({ product: groups }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildLts({ service: "lts", region: "r", billing: "ondemand", quantity: 1, hours: 730, flow_gb: 0, index_gb: 0, cold_mb: 720, storage_mb: 0, transfer_basic_gb: 0, transfer_senior_gb: 0 }, context);
  expect(card.selectedProduct.productAllInfos).toMatchObject([{}, {}, { addToList_product: "1.00 GB" }, {}, {}, {}]);
});
