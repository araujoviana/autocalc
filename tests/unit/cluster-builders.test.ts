import { expect, test } from "bun:test";
import { buildNat } from "../../src/core/services/nat.ts";
import { buildCce } from "../../src/core/services/cce.ts";
import { buildSfs } from "../../src/core/services/sfs.ts";
import { buildCbr } from "../../src/core/services/cbr.ts";

test("NAT, CCE and SFS retain their service-specific form state", async () => {
  const context = {
    productInfo: async (service: string) => ({
      product: Object.fromEntries([
        [
          { nat: "natgateway_natgateway", cce: "cce_cce.cluster", sfsturbo: "sfsturbo_sfsturbo" }[service]!,
          [
            {
              resourceSpecCode: { nat: "natgateway_small", cce: "cce.s2.small", sfsturbo: "sfs.turbo.20MBps" }[service],
              cloudServiceType: "c",
              resourceType: "r",
              productType: "dataInfo_13_",
              clusterType: "dataInfo_2_",
              clusterMasterScale: "dataInfo_4_",
              clusterNodeScale: "dataInfo_50_",
              planList: ["ONDEMAND", "MONTHLY", "YEARLY"].map(billingMode => ({
                billingMode,
                productId: "p",
                periodNum: billingMode === "ONDEMAND" ? null : 1,
                amount: 1,
              })),
            },
          ],
        ],
      ]),
    }),
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
    productInfo: async () => ({
      product: {
        "cce_cce.cluster": [
          {
            resourceSpecCode: "cce.s2.small",
            cloudServiceType: "c",
            resourceType: "r",
            productType: "dataInfo_13_",
            clusterType: "dataInfo_2_",
            clusterMasterScale: "dataInfo_4_",
            clusterNodeScale: "dataInfo_50_",
            planList: [{ billingMode: "ONDEMAND", productId: "p", amount: 1, usageFactor: null }],
          },
        ],
      },
    }),
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

test("CCE builds unified Standard/Turbo cluster family and verifies vendor controls", async () => {
  const { createSyntheticBusinessCatalog } = await import("../support/business-catalog.ts");
  const { catalog } = createSyntheticBusinessCatalog();
  const context = {
    productInfo: (service: string, region: string) => catalog.productInfo(service, region),
    rate: async (body: Record<string, unknown>) => ({
      productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })),
    }),
  };

  for (const region of ["sa-brazil-1", "la-south-2"]) {
    // Standard/Turbo HA variants across scales
    for (const scale of ["small", "medium", "large", "xlarge"] as const) {
      const card = await buildCce({ service: "cce", region, billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "standard", ha: true, scale }, context);
      expect((card.selectedProduct.productAllInfos as any[])[0].resourceSpecCode).toBe(`cce.s2.${scale}`);
      const render = (card.rewriteValue.template_RENDER as any).calculator_clustertype_radio;
      expect(render.productType).toBe("dataInfo_13_");
      expect(render.clusterType).toBe("dataInfo_2_");
      expect(render.clusterMasterScale).toBe("dataInfo_4_");
      expect(render.clusterNodeScale).toBeDefined();
    }

    // Single master variant
    const single = await buildCce({ service: "cce", region, billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "standard", ha: false, scale: "small" }, context);
    expect((single.selectedProduct.productAllInfos as any[])[0].resourceSpecCode).toBe("cce.s1.small");
    const singleRender = (single.rewriteValue.template_RENDER as any).calculator_clustertype_radio;
    expect(singleRender.clusterMasterScale).toBe("dataInfo_5_");
    expect(singleRender.clusterNodeScale).toBe("dataInfo_50_");
  }

  // Fails closed on missing required vendor controls
  const brokenContext = {
    productInfo: async () => ({
      product: {
        "cce_cce.cluster": [{
          resourceSpecCode: "cce.s2.small",
          cloudServiceType: "hws.service.type.cce",
          resourceType: "hws.resource.type.cce.cluster",
          planList: [{ billingMode: "ONDEMAND", productId: "p1", amount: 1, usageFactor: "duration" }],
          // Missing productType, clusterType, clusterMasterScale, clusterNodeScale
        }],
      },
    }),
    rate: async () => ({ productRatingResult: [{ id: "p1", amount: 1 }] }),
  };
  await expect(buildCce({ service: "cce", region: "sa-brazil-1", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "standard", ha: true, scale: "small" }, brokenContext)).rejects.toThrow(/missing required vendor control/i);
});

test("CCE Autopilot is supported in sa-brazil-1 and verified unavailable in la-south-2", async () => {
  const { createSyntheticBusinessCatalog } = await import("../support/business-catalog.ts");
  const { catalog } = createSyntheticBusinessCatalog();
  const context = {
    productInfo: (service: string, region: string) => catalog.productInfo(service, region),
    rate: async (body: Record<string, unknown>) => ({
      productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })),
    }),
  };

  // 1. sa-brazil-1 Autopilot base cluster
  const spAutopilot = await buildCce(
    { service: "cce", region: "sa-brazil-1", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "autopilot", ha: true, scale: "small" },
    context
  );
  expect((spAutopilot.selectedProduct.productAllInfos as any[]).length).toBe(1);
  const clusterProd = (spAutopilot.selectedProduct.productAllInfos as any[])[0];
  expect(clusterProd.resourceSpecCode).toBe("cce.autopilot.cluster");
  expect(clusterProd.productType).toBe("dataInfo_36_");
  expect(clusterProd.addToList_product).toBe("dataInfo_36_");
  const render = (spAutopilot.rewriteValue.template_RENDER as any);
  expect(render.calculator_clustertype_radio.productType).toBe("dataInfo_36_");
  expect(render.calculator_cce_cciType_switch.cciType).toBe("calc_17_");

  // 2. sa-brazil-1 Autopilot with container vCPUs and memory
  const spAutopilotWithResources = await buildCce(
    { service: "cce", region: "sa-brazil-1", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "autopilot", ha: true, scale: "small", vcpus: 4, memory_gb: 16 },
    context
  );
  expect((spAutopilotWithResources.selectedProduct.productAllInfos as any[]).length).toBe(3);
  const products = spAutopilotWithResources.selectedProduct.productAllInfos as any[];
  expect(products[0].resourceSpecCode).toBe("cce.autopilot.cluster");
  expect(products[1].resourceSpecCode).toBe("autopilot.container.cpu");
  expect(products[1].resourceSize).toBe(4);
  expect(products[2].resourceSpecCode).toBe("autopilot.container.mem");
  expect(products[2].resourceSize).toBe(16);
  const renderResources = spAutopilotWithResources.rewriteValue.template_RENDER as any;
  expect(renderResources.calculator_vCPUs_stepper.UNSET_Stepper_0.measureValue).toBe(4);
  expect(renderResources.calculator_mem_stepper.UNSET_Stepper_0.measureValue).toBe(16);

  // 3. la-south-2 Autopilot is unavailable -> fails closed
  await expect(
    buildCce({ service: "cce", region: "la-south-2", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "autopilot", ha: true, scale: "small" }, context)
  ).rejects.toThrow(/CCE Autopilot is not offered in la-south-2/);

  // 4. Standalone legacy cce.t* request fails closed with portal limitation error
  await expect(
    buildCce({ service: "cce", region: "sa-brazil-1", billing: "ondemand", quantity: 1, periods: 1, hours: 730, cluster_type: "standard", ha: true, scale: "small", spec: "cce.t2.small" }, context)
  ).rejects.toThrow(/Standalone CCE Turbo legacy SKU 'cce.t2.small' cannot be encoded/);
});
