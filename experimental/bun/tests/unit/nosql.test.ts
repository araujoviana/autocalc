import { expect, test } from "bun:test";
import { buildNosql } from "../../src/core/services/nosql.ts";
test("GeminiDB applies node count only to VM", async () => {
  const planList = [{ billingMode: "MONTHLY", productId: "p" }];
  const context = { productInfo: async () => ({ product: { "nosql_nosql.vm": [{ resourceSpecCode: "geminidb.cassandra-geminifs.large.4", versionType: "dataInfo_71_", deploymentModal: "dataInfo_65_", cloudServiceType: "c", resourceType: "r", spec: "s", type: "t", version: "v", cpuType: "cpu", planList }], "nosql_nosql.volume": [{ resourceSpecCode: "geminidb.cassandra-geminifs.ultrahigh", cloudServiceType: "c", resourceType: "r", planList }] } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) };
  const card = await buildNosql({ service: "nosql", region: "r", billing: "monthly", periods: 1, hours: 730, flavor: "large.4", nodes: 3, storage_gb: 100, engine: "dynamodb" }, context);
  expect(card.selectedProduct.productAllInfos).toMatchObject([{ productNum: 3 }, { productNum: 1, resourceSize: 100 }]);
});

test("GeminiDB rejects missing required catalog fields instead of saving undefined labels", async () => {
  const planList = [{ billingMode: "MONTHLY", productId: "p" }];
  const context = { productInfo: async () => ({ product: { "nosql_nosql.vm": [{ resourceSpecCode: "geminidb.cassandra-geminifs.large.4", versionType: "dataInfo_71_", deploymentModal: "dataInfo_65_", spec: "s", planList }], "nosql_nosql.volume": [{ resourceSpecCode: "geminidb.cassandra-geminifs.ultrahigh", planList }] } }), rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1 })) }) };
  await expect(buildNosql({ service: "nosql", region: "r", billing: "monthly", periods: 1, hours: 730, flavor: "large.4", nodes: 2, storage_gb: 100, engine: "dynamodb" }, context)).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE" });
});
