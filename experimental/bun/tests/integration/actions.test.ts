import { expect, test } from "bun:test";
import { createCore } from "../../src/core/index.ts";
test("quote finds the exact catalog SKU beyond the search result limit", async () => {
  const plan = (amount: number) => [{ billingMode: "ONDEMAND", planType: "PRICEPLAN", amount, usageFactor: "Duration" }];
  const entries = Array.from({ length: 1000 }, (_, index) => ({ resourceSpecCode: `target.${index}`, cloudServiceType: "c", resourceType: "r", planList: plan(1) }));
  entries.push({ resourceSpecCode: "target", cloudServiceType: "c", resourceType: "r", planList: plan(2) });
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: { g: entries } };
    if (url.includes("language?")) return { ecs: {} };
    return { global: { r: "Region" }, regionsOfSite: { HWC: ["r"] }, menuInfos: [{ parentCategoryName: "Compute", subCategoryLists: [{ urlPath: "ecs", categoryName: "ECS", hasCalculator: true, regionOnline: { regionList: ["r"] } }] }] };
  } }, rating: async body => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }) });
  try { expect(await core.invoke("quote", { region: "r", items: [{ service: "ecs", spec: "target" }], hours: 1 })).toMatchObject({ total: 1 }); }
  finally { await core.close(); }
});
test("quote uses the first exact SKU consistently when codes repeat", async () => {
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: { g: [
      { resourceSpecCode: "same", cloudServiceType: "first", resourceType: "r", productSpecSysDesc: "first SKU", planList: [{ billingMode: "ONDEMAND", planType: "PRICEPLAN", amount: 10, usageFactor: "Duration" }] },
      { resourceSpecCode: "same", cloudServiceType: "second", resourceType: "r", productSpecSysDesc: "second SKU", planList: [{ billingMode: "ONDEMAND", planType: "PRICEPLAN", amount: 1, usageFactor: "traffic" }] },
    ] } };
    if (url.includes("language?")) return { ecs: {} };
    return { global: { r: "Region" }, regionsOfSite: { HWC: ["r"] }, menuInfos: [{ parentCategoryName: "Compute", subCategoryLists: [{ urlPath: "ecs", categoryName: "ECS", hasCalculator: true, regionOnline: { regionList: ["r"] } }] }] };
  } }, rating: async body => {
    const line = (body.productInfos as Array<Record<string, unknown>>)[0]!;
    expect(line).toMatchObject({ cloudServiceType: "first", usageFactor: "Duration" });
    return { productRatingResult: [{ id: line.id, amount: 1, originalAmount: 1 }] };
  } });
  try { expect(await core.invoke("quote", { region: "r", items: [{ service: "ecs", spec: "same" }], hours: 1 })).toMatchObject({ items: [{ description: "first SKU" }] }); }
  finally { await core.close(); }
});
test("RI list warns when catalog disk quantity is lower than the requested VM quantity", async () => {
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: { ec2_vm: [{ resourceSpecCode: "c7.linux", RITime: "nodeData.1_3", spec: "c7", planList: [{ billingMode: "RI", originType: "perPrice", amount: 10 }] }], "ec2_vm.image.special": [{ id: "i", __platform: "Linux", name: "AlmaLinux", type: ["c7"] }], ebs_volume: [{ resourceSpecCode: "GPSSD", type: "ssd", productNum: 1, planList: [{ billingMode: "ONDEMAND", productId: "d", amount: 0.001 }] }] } };
    return { global: { r: "Region" }, regionsOfSite: { HWC: ["r"] }, menuInfos: [{ parentCategoryName: "Compute", subCategoryLists: [{ urlPath: "ecs", categoryName: "ECS", hasCalculator: true, regionOnline: { regionList: ["r"] } }] }] };
  } }, rating: async () => ({}) });
  try {
    const result = await core.invoke("create_price_list", { name: "test", dry_run: true, items: [{ service: "ecs", region: "r", flavor: "c7", billing: "ri", quantity: 2 }] }) as { warnings: string[] };
    expect(result.warnings.some(warning => warning.includes("disk") && warning.includes("quantity"))).toBe(true);
  } finally { await core.close(); }
});
test("update replaces cards in place and preserves list metadata", async () => {
  let saved: Record<string, unknown> | undefined;
  const core = createCore({ reader: { getUncached: async () => ({ retCode: 200, data: { name: "original", billingMode: "cart.shareList.billingModeMonth", extra: "keep", totalPrice: { amount: 0 }, cartListData: [] } }) }, catalogReader: { get: async url => url.includes("productInfo") ? { product: { "apig_apig.instance": [{ resourceSpecCode: "BASIC", cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: "p" }] }] } } : { global: { r: "Region" }, regionsOfSite: { HWC: ["r"] }, menuInfos: [{ parentCategoryName: "API", subCategoryLists: [{ urlPath: "apig", categoryName: "API", hasCalculator: true, regionOnline: { regionList: ["r"] } }] }] } }, rating: async body => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 5, originalAmount: 5 })) }), listSession: { lists: async () => [], create: async () => "a", copy: async () => "a", delete: async () => {}, update: async (id, payload) => { expect(id).toBe("abc"); saved = payload; } } });
  try {
    const result = await core.updatePriceList("abc", [{ service: "apig", region: "r" }]);
    expect(result).toMatchObject({ id: "abc", name: "original", total_usd: 5 });
    expect(saved).toMatchObject({ name: "original", billingMode: "cart.shareList.billingModeMonth", extra: "keep", totalPrice: { amount: 5 } });
    expect((saved?.cartListData as unknown[]).length).toBe(1);
    saved = undefined;
    await core.updatePriceList("abc", [{ service: "apig", region: "r" }], { dryRun: true });
    expect(saved).toBeUndefined();
  } finally { await core.close(); }
});
test("core validates inputs and dispatches shared list actions", async () => {
  const core = createCore({ reader: { getUncached: async () => ({ retCode: 200, data: { name: "demo", totalPrice: { amount: 0 }, cartListData: [] } }) } });
  try {
    expect(await core.invoke("read_price_list", { url_or_id: "abc123" })).toMatchObject({ id: "abc123", total: 0 });
    await expect(core.invoke("read_price_list", { url_or_id: "bad URL" })).rejects.toThrow();
    await expect(core.invoke("no_such_action", {})).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(core.invoke("toString", {})).rejects.toMatchObject({ code: "VALIDATION" });
  } finally { await core.close(); }
});

test("copy reports created ID when optional rename fails", async () => {
  const core = createCore({ reader: { getUncached: async () => ({ retCode: 200, data: { cartListData: [] } }) }, listSession: { lists: async () => [], create: async () => "a", copy: async () => "abc123", update: async () => { throw new Error("offline"); }, delete: async () => {} } });
  try { await expect(core.invoke("duplicate_price_list", { url_or_id: "abc", new_name: "new" })).rejects.toMatchObject({ details: { created_id: "abc123" } }); }
  finally { await core.close(); }
});

test("rename preserves card detail without inventing missing product arrays", async () => {
  let saved: Record<string, unknown> | undefined;
  const detail = { name: "old", cartListData: [{ selectedProduct: { serviceCode: "ecs", extra: "keep" }, custom: "keep" }] };
  const core = createCore({ reader: { getUncached: async () => ({ retCode: 200, data: detail }) }, listSession: { lists: async () => [], create: async () => "a", copy: async () => "a", update: async (_id, value) => { saved = value; }, delete: async () => {} } });
  try { await core.invoke("rename_price_list", { url_or_id: "abc", new_name: "new" }); expect(saved).toEqual({ ...detail, name: "new" }); }
  finally { await core.close(); }
});

test("rename rejects incomplete list detail without writing", async () => {
  let writes = 0;
  const core = createCore({ reader: { getUncached: async () => ({ retCode: 200, data: { name: "old" } }) }, listSession: { lists: async () => [], create: async () => "a", copy: async () => "a", update: async () => { writes++; }, delete: async () => {} } });
  try { await expect(core.invoke("rename_price_list", { url_or_id: "abc", new_name: "new" })).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE" }); expect(writes).toBe(0); }
  finally { await core.close(); }
});

test("dry-run builds cards without authenticated writes", async () => {
  let writes = 0;
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: { "apig_apig.instance": [{ resourceSpecCode: "BASIC", cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: "p" }] }] } };
    return { global: { "la-south-2": "Santiago" }, regionsOfSite: { HWC: ["la-south-2"] }, menuInfos: [{ parentCategoryName: "API", subCategoryLists: [{ urlPath: "apig", categoryName: "API", hasCalculator: true, regionOnline: { regionList: ["la-south-2"] } }] }] };
  } }, rating: async body => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 5, originalAmount: 5 })) }), createList: async () => { writes++; return "abc"; } });
  try { expect(await core.invoke("create_price_list", { name: "draft", dry_run: true, items: [{ service: "apig", region: "Santiago" }] })).toMatchObject({ total_usd: 5, dry_run: true }); expect(writes).toBe(0); }
  finally { await core.close(); }
});

test("region comparison preserves per-region failures", async () => {
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: { g: [{ resourceSpecCode: "x", cloudServiceType: "c", resourceType: "r", productSpecSysDesc: "desc", planList: [{ billingMode: "MONTHLY", planType: "PRICEPLAN", amount: 1 }] }] } };
    if (url.includes("language?")) return { ecs: {} };
    return { global: { "la-south-2": "Santiago" }, regionsOfSite: { HWC: ["la-south-2"] }, menuInfos: [{ parentCategoryName: "Compute", subCategoryLists: [{ urlPath: "ecs", categoryName: "ECS", hasCalculator: true, regionOnline: { regionList: ["la-south-2"] } }] }] };
  } }, rating: async body => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 2, originalAmount: 2 })) }) });
  try { expect(await core.invoke("compare_regions", { items: [{ service: "ecs", spec: "x" }], regions: ["Santiago", "unknown"] })).toMatchObject({ regions: [{ region: "la-south-2", total_usd: 2 }, { region: "unknown", error: "REGION_NOT_FOUND" }] }); }
  finally { await core.close(); }
});

test("empty billing mode comparison uses Python's default modes", async () => {
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: { g: [{ resourceSpecCode: "x", cloudServiceType: "c", resourceType: "r", planList: ["ONDEMAND", "MONTHLY", "YEARLY"].map(billingMode => ({ billingMode, planType: "PRICEPLAN", amount: 1, usageFactor: "Duration" })) }] } };
    if (url.includes("language?")) return { ecs: {} };
    return { global: { r: "Region" }, regionsOfSite: { HWC: ["r"] }, menuInfos: [{ parentCategoryName: "Compute", subCategoryLists: [{ urlPath: "ecs", categoryName: "ECS", hasCalculator: true, regionOnline: { regionList: ["r"] } }] }] };
  } }, rating: async body => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1 })) }) });
  try {
    const result = await core.invoke("compare_modes", { region: "r", items: [{ service: "ecs", spec: "x" }], modes: [] }) as { modes: Array<{ mode: string }> };
    expect(result.modes.map(row => row.mode)).toEqual(["ondemand", "monthly", "yearly"]);
  } finally { await core.close(); }
});

test("quote action resolves SKU and uses rating endpoint", async () => {
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: { g: [{ resourceSpecCode: "x", cloudServiceType: "c", resourceType: "r", productSpecSysDesc: "desc", planList: [{ billingMode: "ONDEMAND", planType: "PRICEPLAN", amount: 1, usageFactor: "Duration" }] }] } };
    if (url.includes("language?")) return { ecs: {} };
    return { global: { "la-south-2": "Santiago" }, regionsOfSite: { HWC: ["la-south-2"] }, menuInfos: [{ parentCategoryName: "Compute", subCategoryLists: [{ urlPath: "ecs", categoryName: "ECS", hasCalculator: true, regionOnline: { regionList: ["la-south-2"] } }] }] };
  } }, rating: async body => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 2, originalAmount: 2 })) }) });
  try { expect(await core.invoke("quote", { region: "Santiago", items: [{ service: "ecs", spec: "x" }], hours: 10 })).toMatchObject({ region: "la-south-2", total: 20 }); }
  finally { await core.close(); }
});

test("search action resolves region aliases and forwards refresh", async () => {
  const requests: Array<{ url: string; refresh?: boolean }> = [];
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async (url, options) => {
    requests.push({ url, ...(options?.refresh === undefined ? {} : { refresh: options.refresh }) });
    if (url.includes("productInfo")) return { product: { g: [] } };
    if (url.includes("language?")) return { ecs: {} };
    return { global: { "la-south-2": "Santiago" }, regionsOfSite: { HWC: ["la-south-2"] } };
  } } });
  try { expect(await core.invoke("search_skus", { service: "ecs", region: "Santiago", refresh: true })).toEqual([]); expect(requests.some(request => request.url.includes("region=la-south-2") && request.refresh)).toBe(true); }
  finally { await core.close(); }
});

test("discovery actions share catalog behavior", async () => {
  const menu = { global: { r: "Region" }, regionsOfSite: { HWC: ["r"] }, menuInfos: [{ parentCategoryName: "Compute", subCategoryLists: [{ urlPath: "ecs", categoryName: "Elastic Cloud Server", hasCalculator: true, regionOnline: { regionList: ["r"] } }] }] };
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => url.includes("productInfo") ? { product: {} } : menu } });
  try {
    expect(await core.invoke("list_services", { query: "cloud" })).toEqual([{ service: "ecs", name: "Elastic Cloud Server", category: "Compute" }]);
    expect(await core.invoke("list_regions", { service: "ecs" })).toEqual({ r: "Region" });
    expect(await core.invoke("describe_service", { service: "ecs", region: "r" })).toMatchObject({ service: "ecs", sold_in_region: true });
  } finally { await core.close(); }
});

test("RabbitMQ discovery accepts the supported builder name and uses the vendor service code", async () => {
  const urls: string[] = [];
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    urls.push(url);
    if (url.includes("productInfo")) return { product: { group: [{ resourceSpecCode: "rabbit", productSpecSysDesc: "dataInfo_1_", planList: [{ billingMode: "MONTHLY", planType: "PRICEPLAN", amount: 2 }] }] } };
    if (url.includes("language?")) return { rabbitMQ: { dataInfo_1_: "RabbitMQ description" } };
    return { global: { r: "Region" }, regionsOfSite: { HWC: ["r"] }, menuInfos: [{ parentCategoryName: "Messaging", subCategoryLists: [{ urlPath: "rabbitMQ", categoryName: "RabbitMQ", hasCalculator: true, regionOnline: { regionList: ["r"], r: { common: ["PERIOD"] } } }] }] };
  } } });
  try {
    expect(await core.invoke("list_regions", { service: "rabbitmq" })).toEqual({ r: "Region" });
    expect(await core.invoke("describe_service", { service: "rabbitmq", region: "r" })).toMatchObject({ sold_in_region: true, builders: [{ service: "rabbitmq" }] });
    expect(await core.invoke("search_skus", { service: "rabbitmq", region: "r" })).toMatchObject([{ description: "RabbitMQ description" }]);
    expect(urls.some(url => url.includes("urlPath=rabbitMQ"))).toBe(true);
  } finally { await core.close(); }
});

test("cancelling a card rating prevents a later list creation", async () => {
  const controller = new AbortController();
  let writes = 0, started!: () => void;
  const ratingStarted = new Promise<void>(resolve => { started = resolve; });
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: { "apig_apig.instance": [{ resourceSpecCode: "BASIC", cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: "p" }] }] } };
    return { global: { "la-south-2": "Santiago" }, regionsOfSite: { HWC: ["la-south-2"] }, menuInfos: [{ parentCategoryName: "API", subCategoryLists: [{ urlPath: "apig", categoryName: "API", hasCalculator: true, regionOnline: { regionList: ["la-south-2"] } }] }] };
  } }, rating: async () => { started(); return await new Promise<Record<string, unknown>>(() => {}); }, createList: async () => { writes++; return "abc"; } });
  try {
    const pending = core.invoke("create_price_list", { name: "draft", items: [{ service: "apig", region: "Santiago" }] }, { signal: controller.signal });
    await ratingStarted;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    expect(writes).toBe(0);
  } finally { await core.close(); }
});

test("cancellation after reading a list prevents rename", async () => {
  const controller = new AbortController();
  let writes = 0;
  const core = createCore({ reader: { getUncached: async () => { controller.abort(); return { retCode: 200, data: { cartListData: [] } }; } }, listSession: { lists: async () => [], create: async () => "a", copy: async () => "a", update: async () => { writes++; }, delete: async () => {} } });
  try {
    await expect(core.invoke("rename_price_list", { url_or_id: "abc", new_name: "new" }, { signal: controller.signal })).rejects.toMatchObject({ code: "CANCELLED" });
    expect(writes).toBe(0);
  } finally { await core.close(); }
});

test("comparison cancellation is not reported as a regional pricing failure", async () => {
  const controller = new AbortController();
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: { g: [{ resourceSpecCode: "x", cloudServiceType: "c", resourceType: "r", productSpecSysDesc: "desc", planList: [{ billingMode: "MONTHLY", planType: "PRICEPLAN", amount: 1 }] }] } };
    if (url.includes("language?")) return { ecs: {} };
    return { global: { "la-south-2": "Santiago" }, regionsOfSite: { HWC: ["la-south-2"] }, menuInfos: [{ parentCategoryName: "Compute", subCategoryLists: [{ urlPath: "ecs", categoryName: "ECS", hasCalculator: true, regionOnline: { regionList: ["la-south-2"] } }] }] };
  } }, rating: async () => { controller.abort(); return {}; } });
  try { await expect(core.invoke("compare_regions", { items: [{ service: "ecs", spec: "x" }], regions: ["Santiago"] }, { signal: controller.signal })).rejects.toMatchObject({ code: "CANCELLED" }); }
  finally { await core.close(); }
});

test("legacy ECS publish builds through the shared encoder and saves once", async () => {
  let payload: Record<string, unknown> | undefined, calls = 0;
  const planList = [{ billingMode: "MONTHLY", productId: "p" }];
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: {
      ec2_vm: [{ resourceSpecCode: "c7.linux", cloudServiceType: "c", resourceType: "vm", spec: "c7", arch: "x", vmType: "v", cpu: "2", mem: "4", generation: "g", planList }],
      "ec2_vm.image.special": [{ id: "i", __platform: "Linux", name: "AlmaLinux", type: ["c7"] }],
      ebs_volume: ["GPSSD", "SSD"].map(type => ({ resourceSpecCode: type, cloudServiceType: "c", resourceType: "disk", type, planList })),
      vpc_bandwidth: [{ resourceSpecCode: "19_bgp", cloudServiceType: "c", resourceType: "bandwidth", planList }],
    } };
    return { global: { r: "Region" }, regionsOfSite: { HWC: ["r"] }, menuInfos: [{ parentCategoryName: "Compute", subCategoryLists: [{ urlPath: "ecs", categoryName: "ECS", hasCalculator: true, regionOnline: { regionList: ["r"] } }] }] };
  } }, rating: async body => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }), createList: async value => { calls++; payload = value; return "abc"; } });
  try {
    const result = await core.publishLegacyEcs("legacy", [{ region: "r", flavor: "c7.linux", system_disk: { type: "GPSSD", size: 40 }, data_disks: [{ type: "SSD", size: 100 }] }]);
    expect(calls).toBe(1);
    expect(result).toMatchObject({ id: "abc", name: "legacy", total_usd: 4, items: [{ flavor: "c7", billing: "MONTHLY", quantity: 1, amount_usd: 4 }] });
    const cards = payload?.cartListData as Array<{ rewriteValue: Record<string, unknown>; selectedProduct: { productAllInfos: Array<Record<string, unknown>> } }>;
    expect(cards[0]?.rewriteValue).toMatchObject({ template_RENDER: { calculator_eip_switch: { UNSET_Switch: "calc_14_" } } });
    expect(cards[0]?.selectedProduct.productAllInfos).toEqual(expect.arrayContaining([expect.objectContaining({ resourceSpecCode: "19_bgp", resourceSize: 5 }), expect.objectContaining({ resourceSpecCode: "SSD", resourceSize: 100 })]));
  } finally { await core.close(); }
});

test("closing the core cancels pending ratings and prevents new work", async () => {
  let started!: () => void, writes = 0;
  const ratingStarted = new Promise<void>(resolve => { started = resolve; });
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: { "apig_apig.instance": [{ resourceSpecCode: "BASIC", cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: "p" }] }] } };
    return { global: { r: "Region" }, regionsOfSite: { HWC: ["r"] }, menuInfos: [{ parentCategoryName: "API", subCategoryLists: [{ urlPath: "apig", categoryName: "API", hasCalculator: true, regionOnline: { regionList: ["r"] } }] }] };
  } }, rating: async () => { started(); return await new Promise<Record<string, unknown>>(() => {}); }, createList: async () => { writes++; return "abc"; } });
  const pending = core.invoke("create_price_list", { name: "draft", items: [{ service: "apig", region: "r" }] });
  await ratingStarted;
  await core.close();
  await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  expect(writes).toBe(0);
  await expect(core.invoke("supported_services", {})).rejects.toMatchObject({ code: "CANCELLED" });
  await core.close();
});

test("quote selects OBS catalog entry by usage factor instead of the first duplicate spec", async () => {
  let request: Record<string, unknown> | undefined;
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: { obs_obs: [
      { resourceSpecCode: "obs.001", cloudServiceType: "wrong", resourceType: "wrong", storageType: "dataInfo_2_", planList: [{ billingMode: "ONDEMAND", usageFactor: "get" }] },
      { resourceSpecCode: "obs.001", cloudServiceType: "correct", resourceType: "r", storageType: "dataInfo_2_", planList: [{ billingMode: "ONDEMAND", usageFactor: "size" }] },
    ] } };
    return { global: { r: "Region" }, menuInfos: [{ parentCategoryName: "Storage", subCategoryLists: [{ urlPath: "obs", categoryName: "OBS", hasCalculator: true, regionOnline: { regionList: ["r"] } }] }] };
  } }, rating: async body => { request = body; return { productRatingResult: [{ id: "item0", amount: 1 }] }; } });
  try {
    await core.invoke("quote", { region: "r", items: [{ service: "obs", spec: "obs.001", usage_factor: "size", usage_value: 100 }] });
    expect(request?.productInfos).toMatchObject([{ cloudServiceType: "correct", usageFactor: "size", usageValue: 100 }]);
  } finally { await core.close(); }
});

test("create identifies the item that failed to build", async () => {
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => url.includes("productInfo") ? { product: { "apig_apig.instance": [] } } : { global: { r: "Region" }, menuInfos: [{ parentCategoryName: "API", subCategoryLists: [{ urlPath: "apig", categoryName: "API", hasCalculator: true, regionOnline: { regionList: ["r"] } }] }] } }, rating: async () => ({}) });
  try { await expect(core.invoke("create_price_list", { name: "x", dry_run: true, items: [{ service: "apig", region: "r", title: "failure" }] })).rejects.toMatchObject({ details: { index: 0, title: "failure" } }); }
  finally { await core.close(); }
});

test("quote refuses ambiguous OBS usage lines", async () => {
  const core = createCore({ reader: { getUncached: async () => ({}) }, catalogReader: { get: async url => {
    if (url.includes("productInfo")) return { product: { obs_obs: ["dataInfo_2_", "dataInfo_3_"].map(storageType => ({ resourceSpecCode: "obs.001", storageType, planList: [{ billingMode: "ONDEMAND", usageFactor: "get" }] })) } };
    return { global: { r: "Region" }, menuInfos: [{ parentCategoryName: "Storage", subCategoryLists: [{ urlPath: "obs", categoryName: "OBS", hasCalculator: true, regionOnline: { regionList: ["r"] } }] }] };
  } }, rating: async () => ({}) });
  try { await expect(core.invoke("quote", { region: "r", items: [{ service: "obs", spec: "obs.001", usage_factor: "get", usage_value: 1 }] })).rejects.toMatchObject({ code: "VALIDATION", message: expect.stringContaining("ambiguous") }); }
  finally { await core.close(); }
});
