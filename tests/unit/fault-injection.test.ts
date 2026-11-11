import { describe, expect, it } from "bun:test";
import { diffProducts } from "../support/compat/harness.ts";
import { buildCce } from "../../src/core/services/cce.ts";
import { buildElb } from "../../src/core/services/elb.ts";
import { buildKafka } from "../../src/core/services/kafka.ts";
import { buildRabbitmq } from "../../src/core/services/rabbitmq.ts";
import { requirement, type Requirement } from "../../src/core/quote/model.ts";
import { DraftStore } from "../../src/core/quote/store.ts";
import { draftQuote } from "../../src/core/quote/draft.ts";
import { CalculatorError } from "../../src/core/errors.ts";
import { createSyntheticBusinessCatalog } from "../support/business-catalog.ts";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";

describe("Deliberate Fault-Injection Tests (Harness & Guard Sensitivity)", () => {
  describe("1. Category and Topology Validation in Production Builders", () => {
    it("rejects unknown or invalid scale in production buildCce", async () => {
      const context = {
        productInfo: async () => ({ product: {} }),
        rate: async () => ({}),
      };
      await expect(
        buildCce(
          {
            service: "cce",
            region: "sa-brazil-1",
            billing: "ondemand",
            quantity: 1,
            periods: 1,
            hours: 730,
            cluster_type: "standard",
            ha: true,
            scale: "gigantic_invalid" as any,
          },
          context
        )
      ).rejects.toThrow(/Unknown CCE scale/);
    });

    it("rejects unverified or fabricated cluster_type in production buildCce", async () => {
      const context = {
        productInfo: async () => ({ product: {} }),
        rate: async () => ({}),
      };
      await expect(
        buildCce(
          {
            service: "cce",
            region: "sa-brazil-1",
            billing: "ondemand",
            quantity: 1,
            periods: 1,
            hours: 730,
            cluster_type: "autopilot_fabricated" as any,
            ha: true,
            scale: "small",
          },
          context
        )
      ).rejects.toThrow(/Unsupported CCE cluster type/);
    });
  });

  describe("2. Production Fail-Closed Behavior for Missing Vendor Controls", () => {
    it("buildCce fails closed with CalculatorError(CATALOG) when productType is omitted", async () => {
      const context = {
        productInfo: async () => ({
          product: {
            "cce_cce.cluster": [
              {
                resourceSpecCode: "cce.s2.small",
                cloudServiceType: "hws.service.type.cce",
                resourceType: "hws.resource.type.cce.cluster",
                clusterType: "dataInfo_2_",
                clusterMasterScale: "dataInfo_4_",
                clusterNodeScale: "dataInfo_50_",
                // Omitted productType
                planList: [{ billingMode: "ONDEMAND", productId: "p1", amount: 1, usageFactor: "duration" }],
              },
            ],
          },
        }),
        rate: async () => ({ productRatingResult: [{ id: "p1", amount: 1 }] }),
      };

      await expect(
        buildCce(
          {
            service: "cce",
            region: "sa-brazil-1",
            billing: "ondemand",
            quantity: 1,
            periods: 1,
            hours: 730,
            cluster_type: "standard",
            ha: true,
            scale: "small",
          },
          context
        )
      ).rejects.toThrow(/missing required vendor control 'productType'/);
    });

    it("buildCce fails closed when clusterNodeScale is omitted from standard cluster", async () => {
      const context = {
        productInfo: async () => ({
          product: {
            "cce_cce.cluster": [
              {
                resourceSpecCode: "cce.s2.small",
                cloudServiceType: "hws.service.type.cce",
                resourceType: "hws.resource.type.cce.cluster",
                productType: "dataInfo_13_",
                clusterType: "dataInfo_2_",
                clusterMasterScale: "dataInfo_4_",
                // Omitted clusterNodeScale
                planList: [{ billingMode: "ONDEMAND", productId: "p1", amount: 1, usageFactor: "duration" }],
              },
            ],
          },
        }),
        rate: async () => ({ productRatingResult: [{ id: "p1", amount: 1 }] }),
      };

      await expect(
        buildCce(
          {
            service: "cce",
            region: "sa-brazil-1",
            billing: "ondemand",
            quantity: 1,
            periods: 1,
            hours: 730,
            cluster_type: "standard",
            ha: true,
            scale: "small",
          },
          context
        )
      ).rejects.toThrow(/missing required vendor control 'clusterNodeScale'/);
    });
  });

  describe("3. Dedicated ELB Production Controls and LCU Detection", () => {
    it("buildElb emits instance and L4 LCU products, and diffProducts catches omitted LCU product", async () => {
      const { catalog } = createSyntheticBusinessCatalog();
      const context = {
        productInfo: (s: string, r: string) => catalog.productInfo(s, r),
        rate: async (body: Record<string, unknown>) => ({
          productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })),
        }),
      };

      const card = await buildElb(
        {
          service: "elb",
          region: "sa-brazil-1",
          billing: "ondemand",
          type: "dedicated",
          flavor: "elbv3.professional",
          l4_lcu: 5,
          quantity: 1,
          periods: 1,
          hours: 730,
        },
        context
      );

      const products = card.selectedProduct.productAllInfos as Array<Record<string, unknown>>;
      expect(products.length).toBe(2);
      expect(products[0]!.resourceSpecCode).toBe("elbv3.professional");
      expect(products[1]!.resourceSpecCode).toBe("elbv3.professional");
      expect(products[1]!.usageFactor).toBe("l4_lcu_duration");
      expect(products[1]!.resourceSize).toBe(5);
      expect(products[1]!.usageValue).toBe(730);

      // Fault injection: simulate a corrupted builder output that dropped the LCU product line
      const corruptedProducts = [products[0]!];
      const diffs = diffProducts(corruptedProducts, products);
      expect(diffs.length).toBe(1);
      expect(diffs[0]!.key).toBe("elbv3.professional:l4_lcu_duration");
    });
  });

  describe("4. Capacity, Unit, Region, Billing and Multiplicity Invariants in diffProducts", () => {
    it("diffProducts catches mutated capacity, unit, region, and billing mode", () => {
      const baseline = [
        {
          resourceSpecCode: "GPSSD",
          resourceSize: 100,
          resourceSizeMeasureId: 17,
          regionId: "sa-brazil-1",
          billingMode: "ONDEMAND",
          productNum: 1,
        },
      ];

      // Mutated capacity
      const mutatedSize = [{ ...baseline[0]!, resourceSize: 999 }];
      expect(diffProducts(baseline, mutatedSize).length).toBe(1);

      // Mutated unit measureId (e.g. GB vs TB)
      const mutatedUnit = [{ ...baseline[0]!, resourceSizeMeasureId: 18 }];
      expect(diffProducts(baseline, mutatedUnit).length).toBe(1);

      // Mutated region
      const mutatedRegion = [{ ...baseline[0]!, regionId: "la-south-2" }];
      expect(diffProducts(baseline, mutatedRegion).length).toBe(1);

      // Mutated billing mode
      const mutatedBilling = [{ ...baseline[0]!, billingMode: "MONTHLY" }];
      expect(diffProducts(baseline, mutatedBilling).length).toBe(1);
    });

    it("diffProducts catches duplicate and missing product multiplicity", () => {
      const twoDisks = [
        { resourceSpecCode: "GPSSD", resourceSize: 100, productNum: 1 },
        { resourceSpecCode: "GPSSD", resourceSize: 100, productNum: 1 },
      ];
      const oneDisk = [
        { resourceSpecCode: "GPSSD", resourceSize: 100, productNum: 1 },
      ];
      expect(diffProducts(twoDisks, oneDisk).length).toBe(1);

      const withExtra = [
        { resourceSpecCode: "GPSSD", resourceSize: 100, productNum: 1 },
        { resourceSpecCode: "extra.disk", resourceSize: 50, productNum: 1 },
      ];
      expect(diffProducts(oneDisk, withExtra).length).toBe(1);
    });
  });

  describe("5. Broker and Storage Scaling in Real Kafka and RabbitMQ Production Cards", () => {
    it("buildKafka scales storage by broker count and diffProducts catches flat storage corruption", async () => {
      const { catalog } = createSyntheticBusinessCatalog();
      const context = {
        productInfo: (s: string, r: string) => catalog.productInfo(s, r),
        rate: async (body: Record<string, unknown>) => ({
          productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })),
        }),
      };

      const card = await buildKafka(
        {
          service: "kafka",
          region: "sa-brazil-1",
          billing: "monthly",
          spec_id: "c6.2u4g.cluster",
          brokers: 3,
          storage_gb: 200,
          quantity: 1,
          periods: 1,
          hours: 730,
        },
        context
      );

      const products = card.selectedProduct.productAllInfos as Array<Record<string, any>>;
      expect(products.length).toBe(2);

      // Instance product scales rate * brokers
      const inst = products[0]!;
      expect(inst.nodeNum).toBe(3);
      expect(inst.resourceSize).toBe(7 * 3); // c6.2u4g.cluster rate = 7

      // Disk product scales storage_gb * brokers
      const disk = products[1]!;
      expect(disk.resourceSize).toBe(600); // 200 * 3
      expect(disk.resouceSizeMeasureId).toBe(17); // GB

      // Form stepper reflects total scaled storage
      const stepperValue = (card.rewriteValue.template_RENDER as any).calculator_kafka_new_storage_stepper.UNSET_Stepper_0.measureValue;
      expect(stepperValue).toBe(600);

      // Fault injection: simulate corrupted disk line with flat 200 GB
      const corruptedDisk = { ...disk, resourceSize: 200 };
      const corruptedProducts = [inst, corruptedDisk];
      const diffs = diffProducts(corruptedProducts, products);
      expect(diffs.length).toBe(1);
      expect(diffs[0]!.differences?.resourceSize).toEqual({ builder: 200, page: 600 });
    });

    it("buildRabbitmq scales storage by broker count and reflects scaled stepper", async () => {
      const { catalog } = createSyntheticBusinessCatalog();
      const context = {
        productInfo: (s: string, r: string) => catalog.productInfo(s, r),
        rate: async (body: Record<string, unknown>) => ({
          productRatingResult: (body.productInfos as Array<{ id: string }>).map(({ id }) => ({ id, amount: 1, originalAmount: 1 })),
        }),
      };

      const card = await buildRabbitmq(
        {
          service: "rabbitmq",
          region: "sa-brazil-1",
          billing: "monthly",
          spec_id: "c6.2u4g.cluster",
          brokers: 3,
          storage_gb: 150,
          version: "3.8",
          quantity: 1,
          periods: 1,
          hours: 730,
        },
        context
      );

      const products = card.selectedProduct.productAllInfos as Array<Record<string, any>>;
      expect(products.length).toBe(2);

      const inst = products[0]!;
      expect(inst.nodeNum).toBe(3);

      const disk = products[1]!;
      expect(disk.resourceSize).toBe(450); // 150 * 3
      expect(disk.resouceSizeMeasureId).toBe(17);

      const stepperVal = (card.rewriteValue.template_RENDER as any).calculator_rabbitMQ_new_storage_stepper.UNSET_Stepper_0.measureValue;
      expect(stepperVal).toBe(450);
    });
  });

  describe("6. Publish Gate Invariant and AZ Rejection", () => {
    it("draftQuote immediately rejects availability-zone selection with per-service reason", async () => {
      const dir = mkdtempSync(join(tmpdir(), "autocalc-fault-draft-"));
      const store = new DraftStore(dir);
      const fakeProvider = { name: "huawei", candidates: async () => [] };

      const req: Requirement = requirement({
        id: "worker-1",
        service: "ecs",
        region: "sa-brazil-1",
        billing: "monthly",
        az: "sa-brazil-1a",
        options: {},
      });

      await expect(draftQuote(fakeProvider as any, "FaultCorp", [req], store)).rejects.toThrow(
        "Availability-zone placement is not supported for ecs."
      );
    });
  });
});
