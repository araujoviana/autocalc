import { expect, test } from "bun:test";
import { buildNat } from "../../src/core/services/nat.ts";
import { buildCce } from "../../src/core/services/cce.ts";
import { buildSfs } from "../../src/core/services/sfs.ts";
import { buildCbr } from "../../src/core/services/cbr.ts";

test("NAT, CCE and SFS retain their service-specific form state", async () => {
  const context = {
    productInfo: async (service: string) => ({ product: Object.fromEntries([[{ nat: "natgateway_natgateway", cce: "cce_cce.cluster", sfsturbo: "sfsturbo_sfsturbo" }[service]!, [{ resourceSpecCode: { nat: "natgateway_small", cce: "cce.s2.small", sfsturbo: "sfs.turbo.20MBps" }[service], cloudServiceType: "c", resourceType: "r", planList: ["ONDEMAND", "MONTHLY", "YEARLY"].map(billingMode => ({ billingMode, productId: "p", periodNum: billingMode === "ONDEMAND" ? null : 1, amount: 1 })) }]]]) }),
    rate: async (body: Record<string, unknown>) => ({ productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })) }),
  };
  const nat = await buildNat({ service: "nat", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, size: "small" }, context);
  expect(nat.rewriteValue).toMatchObject({ global_ONDEMANDTIME: { UNSET_Stepper_0: { measureId: 0 } } });
  const monthly = await buildNat({ service: "nat", region: "r", billing: "monthly", quantity: 1, periods: 3, hours: 730, size: "small" }, context);
  expect(monthly.rewriteValue).toMatchObject({ global_PERIODTIME: { UNSET_PeriodTime: { measureValue: 3 } } });
  expect(monthly.rewriteValue).not.toHaveProperty("global_ONDEMANDTIME");
  const cce = await buildCce({ service: "cce", region: "r", billing: "monthly", quantity: 1, periods: 1, hours: 730, cluster_type: "standard", ha: true, scale: "small" }, context);
  expect(cce.rewriteValue).toMatchObject({ global_QUANTITY: { UNSET_Stepper_0: { measureNameBeforeTrans: "" } } });
  expect(cce.selectedProduct.purchaseNum).toMatchObject({ measureNameBeforeTrans: "", measurePluralNameBeforeTrans: "" });
  const cceOndemand = await buildCce({ service: "cce", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "standard", ha: true, scale: "small" }, context);
  expect(cceOndemand.rewriteValue).not.toHaveProperty("global_QUANTITY");
  const sfs = await buildSfs({ service: "sfsturbo", region: "r", billing: "yearly", quantity: 1, periods: 1, hours: 730, tier: "20MBps", size_gb: 3686.4 }, context);
  expect(sfs.rewriteValue).toMatchObject({ template_RENDER: { calculator_sfsPeriod_36input: 3.6 } });
});

test("CCE preserves an explicitly null catalog usage factor", async () => {
  let factor: unknown = "unseen";
  const context = {
    productInfo: async () => ({ product: { "cce_cce.cluster": [{ resourceSpecCode: "cce.s2.small", cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: "p", amount: 1, usageFactor: null }] }] } }),
    rate: async (body: Record<string, unknown>) => { const line = (body.productInfos as Array<Record<string, unknown>>)[0]!; factor = line.usageFactor; return { productRatingResult: [{ id: line.id, amount: 1 }] }; },
  };
  await buildCce({ service: "cce", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "standard", ha: true, scale: "small" }, context);
  expect(factor).toBeNull();
});

test("CBR preserves an explicitly null catalog usage factor", async () => {
  let factor: unknown = "unseen";
  const context = {
    productInfo: async () => ({ product: { "cbr_cbr.vault": [{ resourceSpecCode: "vault.backup.server.normal", cloudServiceType: "c", resourceType: "r", planList: [{ billingMode: "ONDEMAND", productId: "p", amount: 1, usageFactor: null }] }] } }),
    rate: async (body: Record<string, unknown>) => { const line = (body.productInfos as Array<Record<string, unknown>>)[0]!; factor = line.usageFactor; return { productRatingResult: [{ id: line.id, amount: 1 }] }; },
  };
  await buildCbr({ service: "cbr", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, vault_spec: "vault.backup.server.normal", size_gb: 100 }, context);
  expect(factor).toBeNull();
});

test("CCE builds all offered Turbo variants and rejects invalid combinations", async () => {
  const turboSpecs = ["cce.t2.small", "cce.t2.medium", "cce.t2.large", "cce.t1.small"];
  const context = {
    productInfo: async () => ({
      product: {
        "cce_cce.cluster": turboSpecs.map(spec => ({
          resourceSpecCode: spec,
          cloudServiceType: "hws.service.type.cce",
          resourceType: "hws.resource.type.cce.cluster",
          planList: [{ billingMode: "ONDEMAND", productId: "p", amount: 1, usageFactor: "duration" }],
        })),
      },
    }),
    rate: async (body: Record<string, unknown>) => ({
      productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })),
    }),
  };

  // Turbo HA variants
  for (const scale of ["small", "medium", "large"] as const) {
    const card = await buildCce({ service: "cce", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "turbo", ha: true, scale }, context);
    expect(card.selectedProduct.productAllInfos[0].resourceSpecCode).toBe(`cce.t2.${scale}`);
  }

  // Turbo single-master variant
  const single = await buildCce({ service: "cce", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "turbo", ha: false, scale: "small" }, context);
  expect(single.selectedProduct.productAllInfos[0].resourceSpecCode).toBe("cce.t1.small");

  // Invalid combinations
  await expect(buildCce({ service: "cce", region: "r", billing: "monthly", quantity: 1, periods: 1, hours: 730, cluster_type: "turbo", ha: true, scale: "small" }, context)).rejects.toThrow("on-demand");
  await expect(buildCce({ service: "cce", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "turbo", ha: true, scale: "xlarge" }, context)).rejects.toThrow();
  await expect(buildCce({ service: "cce", region: "r", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "turbo", ha: false, scale: "medium" }, context)).rejects.toThrow();
});

test("CCE builds Standard and Turbo in both sa-brazil-1 and la-south-2 catalogs", async () => {
  const { createSyntheticBusinessCatalog } = await import("../support/business-catalog.ts");
  const { catalog } = createSyntheticBusinessCatalog();
  const context = {
    productInfo: (service: string, region: string) => catalog.productInfo(service, region),
    rate: async (body: Record<string, unknown>) => ({
      productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })),
    }),
  };

  for (const region of ["sa-brazil-1", "la-south-2"]) {
    // Standard HA
    const std = await buildCce({ service: "cce", region, billing: "monthly", quantity: 1, periods: 1, hours: 730, cluster_type: "standard", ha: true, scale: "small" }, context);
    expect(std.selectedProduct.productAllInfos[0].resourceSpecCode).toBe("cce.s2.small");

    // Turbo HA
    const turbo = await buildCce({ service: "cce", region, billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "turbo", ha: true, scale: "medium" }, context);
    expect(turbo.selectedProduct.productAllInfos[0].resourceSpecCode).toBe("cce.t2.medium");
  }
});
