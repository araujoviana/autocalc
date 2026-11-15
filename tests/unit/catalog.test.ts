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
  const catalog = new Catalog({ async get() { return { global: { r: "Region", b: "Beta Region" }, regionsOfSite: { HWC: ["r", "b"] }, menuInfos: [{ parentCategoryName: "Compute", subCategoryLists: [{ urlPath: "ecs", categoryName: "Elastic Cloud Server", hasCalculator: true, regionOnline: { regionList: ["r"] } }, { urlPath: "maas", categoryName: "ModelArts Studio", hasCalculator: true, regionBeta: { regionList: ["b"] } }, { urlPath: "hidden", categoryName: "Hidden", hasCalculator: true, hideCalculator: true }] }] }; } });
  expect(await catalog.services("elastic")).toEqual([{ service: "ecs", name: "Elastic Cloud Server", category: "Compute", regions: ["r"] }]);
  expect(await catalog.services("maas")).toEqual([{ service: "maas", name: "ModelArts Studio", category: "Compute", regions: ["b"] }]);
  expect(await catalog.regions()).toEqual({ r: "Region", b: "Beta Region" });
});

test("catalog memoizes menu, labels, productInfo, and skus per instance and invalidates on refresh", async () => {
  let version = 1;
  const gets: Array<{ url: string; refresh?: boolean }> = [];
  const catalog = new Catalog({
    async get(url, options = {}) {
      gets.push({ url, ...(options.refresh !== undefined ? { refresh: options.refresh } : {}) });
      if (url.includes("productInfo")) {
        return { product: { g: [{ resourceSpecCode: `sku.v${version}`, productSpecSysDesc: "dataInfo_1_", planList: [{ billingMode: "MONTHLY", planType: "PRICEPLAN", amount: version, measureUnit: 1 }] }] } };
      }
      if (url.includes("language?")) return { ecs: { dataInfo_1_: `Label v${version}` } };
      return { global: {}, measureID: { "1": { unit: "month" } }, regionsOfSite: { HWC: ["sa-brazil-1"] }, menuInfos: [] };
    },
  });

  const [first, second] = await Promise.all([
    catalog.skus("ecs", "sa-brazil-1"),
    catalog.skus("ecs", "sa-brazil-1"),
  ]);
  const third = await catalog.skus("ecs", "sa-brazil-1");
  expect(first[0]?.spec).toBe("sku.v1");
  expect(second).toEqual(first);
  expect(third).toEqual(first);
  // Only 1 productInfo + 1 labels + 1 menu read across 3 calls
  expect(gets).toHaveLength(3);

  version = 2;
  const refreshed = await catalog.skus("ecs", "sa-brazil-1", true);
  expect(refreshed[0]?.spec).toBe("sku.v2");
  expect(gets).toHaveLength(6);
  expect(gets.slice(3).every(g => g.refresh === true)).toBe(true);

  const cachedAfterRefresh = await catalog.skus("ecs", "sa-brazil-1");
  expect(cachedAfterRefresh[0]?.spec).toBe("sku.v2");
  expect(gets).toHaveLength(6);
});

test("catalog evicts failed promises so transient transport errors can retry", async () => {
  let fail = true;
  let calls = 0;
  const catalog = new Catalog({
    async get() {
      calls++;
      if (fail) throw new Error("transient failure");
      return { product: { g: [{ resourceSpecCode: "ok.spec" }] } };
    },
  });

  await expect(catalog.productInfo("ecs", "sa-brazil-1")).rejects.toThrow("transient failure");
  fail = false;
  const retried = await catalog.productInfo("ecs", "sa-brazil-1");
  expect(retried.product.g?.[0]?.resourceSpecCode).toBe("ok.spec");
  expect(calls).toBe(2);
});
