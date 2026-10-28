import { expect, test } from "bun:test";
import { Catalog } from "../../src/core/catalog.ts";
import { CalculatorError } from "../../src/core/errors.ts";

test("catalog validates product shape and preserves vendor fields", async () => {
  const calls: Array<{ url: string; refresh?: boolean }> = [];
  const client = { async get(url: string, options: { refresh?: boolean } = {}) { calls.push({ url, ...options }); return { product: { group: [{ resourceSpecCode: "sku", custom: 42 }] } }; } };
  const catalog = new Catalog(client);
  const product = await catalog.productInfo("ecs", "sa-brazil-1", true);
  expect(product.product.group?.[0]?.custom).toBe(42);
  expect(calls[0]?.refresh).toBe(true);
  const invalid = new Catalog({ async get() { return { product: [] }; } });
  await expect(invalid.productInfo("ecs", "x")).rejects.toThrow(CalculatorError);
});

test("search resolves labels and units, filters compute and sorts by price", async () => {
  const catalog = new Catalog({ async get(url) {
    if (url.includes("productInfo")) return { product: { g: [{ resourceSpecCode: "x", productSpecSysDesc: "dataInfo_1_ BSSUNIT.pluralUnit.1", planList: [{ billingMode: "ONDEMAND", planType: "PRICEPLAN", amount: 2, measureUnit: 1 }] }, { resourceSpecCode: "y", productSpecSysDesc: "dataInfo_1_", planList: [{ billingMode: "ONDEMAND", planType: "PRICEPLAN", amount: 1, measureUnit: 1 }] }] } };
    if (url.includes("language?")) return { ecs: { dataInfo_1_: "vCPUs: 4 Memory: 8192 MB" } };
    return { global: {}, measureID: { "1": { unit: "hour", pluralUnit: "hours" } } };
  } });
  const result = await catalog.search("ecs", "r", { min_vcpus: 4, min_memory_gb: 8 });
  expect(result.map(item => item.spec)).toEqual(["y", "x"]);
  expect(result[1]?.description).toContain("hours");
});

test("search preserves intentionally empty catalog labels", async () => {
  const catalog = new Catalog({ async get(url) {
    if (url.includes("productInfo")) return { product: { g: [{ resourceSpecCode: "x", productSpecSysDesc: "before dataInfo_1_ after" }] } };
    if (url.includes("language?")) return { ecs: { dataInfo_1_: "" } };
    return { global: {} };
  } });
  expect((await catalog.search("ecs", "r"))[0]?.description).toBe("before  after");
});

test("menu listing excludes hidden services and filters by name", async () => {
  const catalog = new Catalog({ async get() { return { global: { r: "Region" }, regionsOfSite: { HWC: ["r"] }, menuInfos: [{ parentCategoryName: "Compute", subCategoryLists: [{ urlPath: "ecs", categoryName: "Elastic Cloud Server", hasCalculator: true, regionOnline: { regionList: ["r"] } }, { urlPath: "hidden", categoryName: "Hidden", hasCalculator: true, hideCalculator: true }] }] }; } });
  expect(await catalog.services("elastic")).toEqual([{ service: "ecs", name: "Elastic Cloud Server", category: "Compute", regions: ["r"] }]);
  expect(await catalog.regions()).toEqual({ r: "Region" });
});
