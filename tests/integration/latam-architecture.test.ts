import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import dms from "../fixtures/contracts/dms-regional.json";
import ecs from "../fixtures/contracts/ecs-regional.json";
import { createSyntheticBusinessCatalog } from "../support/business-catalog.ts";
import { Catalog } from "../../src/core/catalog.ts";
import { HuaweiProvider } from "../../src/providers/huawei.ts";
import { DraftStore } from "../../src/core/quote/store.ts";
import { apply, parse, plan, validate } from "../../src/core/quote-file.ts";
import { inFormOnlyMode } from "../../src/core/cards.ts";
import { buildCard } from "../../src/core/services/index.ts";
import type { ActionContext } from "../../src/core/types.ts";

type Dict = Record<string, any>;

// Tests the real compiler, planner, publisher adapter and builders together.
// Browser/save and list prices are synthetic. This certifies component accounting
// and configuration forwarding, never Huawei prices or regional availability.
for (const region of ["sa-brazil-1", "la-south-2"]) {
  test(`complete CCE architecture preserves quantities and DMS storage: ${region}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "autocalc-latam-architecture-"));
    const { transport } = createSyntheticBusinessCatalog();
    const reader = {
      get: async (url: string, options?: { mirror?: string; refresh?: boolean }) => {
        const match = /urlPath=([^&]+).*region=([^&]+)/.exec(url);
        const fixture = match && ({ ...dms.catalogs, ...ecs.catalogs } as Record<string, Dict>)[`${match[1]}|${match[2]}`];
        if (!fixture) return transport.get(url, options);
        const base = match?.[1] === "ecs" ? await transport.get(url, options) as Dict : { product: {} };
        const result = { ...base, product: { ...base.product, ...structuredClone(fixture.product) } };
        // Explicit synthetic price only lets the real planner resolve the named
        // DMS/ECS SKU. It is never used as a rating or publication oracle.
        for (const rows of Object.values(result.product) as Dict[][]) {
          for (const row of rows) for (const term of row.planList ?? []) term.amount = 7;
        }
        return result;
      },
    };
    const catalog = new Catalog(reader);
    const provider = new HuaweiProvider({ skus: (service, r) => catalog.skus(service, r), checkMode: async () => {} });
    const encoded = new WeakMap<object, Dict>();
    const saved: Dict[][] = [];
    const ctx = {
      catalog, provider, drafts: new DraftStore(directory), lists: { lists: async () => [] },
      publish: {
        form: async (input: Dict) => {
          const card = await inFormOnlyMode(() => buildCard(input as never, {
            productInfo: (service, r) => catalog.productInfo(service, r),
            rate: async () => { throw new Error("Offline architecture must not rate"); },
          }));
          encoded.set(card.rewriteValue, card);
          return card.rewriteValue;
        },
        encode: async (_service: string, form: object) => {
          const card = encoded.get(form);
          if (!card) throw new Error("Unbuilt or reused form");
          encoded.delete(form);
          return structuredClone(card);
        },
        publish: async (_name: string, cards: Dict[]) => {
          saved.push(cards);
          return { id: "synthetic-architecture", url: "https://example.invalid/architecture", checks: [] };
        },
        liveVersion: async () => undefined,
      },
    } as unknown as ActionContext;
    try {
      const quote = parse(`
version: "1"
metadata: { id: latam-architecture, customer: Synthetic architecture, title_prefix: Synthetic architecture }
horizon: { duration: 1m, billing_policy: as-specified }
defaults: { provider: huawei, region: ${region}, billing: monthly }
resources:
  - { id: clusters, service: cce, quantity: 2, options: { cluster_type: standard, ha: true, scale: small } }
  - { id: workers, service: ecs, spec: c7n.xlarge.4.linux, quantity: 6, needs: { vcpus: 4, memory: "16 GB" }, options: { os: ubuntu-22.04 } }
  - { id: worker-disks, service: evs, quantity: 6, options: { type: SAS, size_gb: "200 GB" } }
  - { id: ingress, service: elb, billing: ondemand, quantity: 2, options: { type: dedicated, flavor: elbv3.professional, az_type: multi, protocol: tls, l4_lcu: 5 } }
  - { id: public-addresses, service: eip, billing: ondemand, options: { billed_by: traffic, traffic_gb: "120 GB", ip_quantity: 3 } }
  - { id: kafka, service: kafka, quantity: 2, options: { spec_id: c6.2u4g.cluster, brokers: 3, storage_gb: "200 GB" } }
  - { id: rabbit, service: rabbitmq, options: { spec_id: c6.4u8g.cluster, version: "3.8", brokers: 5, storage_gb: "100 GB" } }
`);
      expect(await validate(quote)).toEqual([]);
      const planned = await plan(ctx, quote);
      expect(planned.pending).toEqual([]);
      expect(planned.cards.every(row => !row.spec_problem && !row.unmapped_options.length)).toBe(true);
      expect(quote.cards.map(card => [card.id, card.quantity])).toEqual([
        ["clusters", 2], ["workers", 6], ["worker-disks", 6], ["ingress-1", 1], ["ingress-2", 1],
        ["public-addresses", 1], ["kafka", 2], ["rabbit", 1],
      ]);
      // Planner amounts cover primary SKUs only. Check that every logical
      // resource contributes its full quantity to that explicitly partial sum.
      expect(planned.shards).toHaveLength(1);
      const logical = planned.shards![0]!.resources;
      expect(logical.map(resource => resource.id).sort()).toEqual([
        "clusters", "workers", "worker-disks", "ingress", "public-addresses", "kafka", "rabbit",
      ].sort());
      const units: Record<string, number> = { clusters: 2, workers: 6, "worker-disks": 6, "ingress-1": 1, "ingress-2": 1, "public-addresses": 1, kafka: 2, rabbit: 1 };
      const primarySubtotal = planned.cards.reduce((sum, row) => sum + Number(row.price ?? 0) * units[row.id]!, 0);
      expect(logical.reduce((sum, resource) => sum + (resource.totalPrice ?? 0), 0)).toBeCloseTo(primarySubtotal, 8);
      for (const resource of logical) {
        const subtotal = resource.physicalCards.reduce((sum, physical) => {
          const row = planned.cards.find(row => row.id === physical.title)!;
          expect(row).toBeDefined();
          expect(physical.quantity).toBe(units[physical.title]!);
          return sum + Number(row.price ?? 0) * units[physical.title]!;
        }, 0);
        expect(resource.totalPrice).toBeCloseTo(subtotal, 8);
      }
      await apply(ctx, quote);
      expect(saved).toHaveLength(1);
      expect(saved[0]).toHaveLength(8);
      const byTitle = new Map(saved[0]!.map(card => [card.selectedProduct._customTitle, card]));
      expect([...byTitle.keys()].sort()).toEqual(quote.cards.map(card => card.id).sort());
      for (const card of saved[0]!) expect(card.selectedProduct.region).toBe(region);
      const products = (id: string): Dict[] => byTitle.get(id)!.selectedProduct.productAllInfos;
      expect(products("clusters")[0]).toMatchObject({ resourceSpecCode: "cce.s2.small", productNum: 2 });
      expect(products("workers")).toHaveLength(3);
      expect(products("workers")[0]).toMatchObject({ resourceSpecCode: "c7n.xlarge.4.linux", productNum: 6, cpu: "4dataInfo_36_", mem: "16BSSUNIT.pluralUnit.102" });
      expect(products("workers")[1]).toMatchObject({ name: "Ubuntu 22.04 server 64bit", __platform: "Ubuntu", __os_type: "Linux", productNum: 6 });
      expect(products("workers")[2]).toMatchObject({ resourceSpecCode: "GPSSD", productNum: 6, resourceSize: 40, resouceSizeMeasureId: 17 });
      expect(products("worker-disks")).toHaveLength(1);
      expect(products("worker-disks")[0]).toMatchObject({ resourceSpecCode: "SAS", productNum: 6, resourceSize: 200, resouceSizeMeasureId: 17 });
      for (const id of ["ingress-1", "ingress-2"]) {
        expect(products(id)).toHaveLength(2);
        expect(products(id)).toEqual(expect.arrayContaining([
          expect.objectContaining({ resourceSpecCode: "elbv3.professional", usageFactor: "instance_duration", azType: "calc_67_", flavorType: "calc_71_", productNum: 1, usageValue: 730, usageMeasureId: 4 }),
          expect.objectContaining({ resourceSpecCode: "elbv3.professional", usageFactor: "l4_lcu_duration", resourceSize: 5, resouceSizeMeasureId: 14, azType: "calc_67_", flavorType: "calc_71_", productNum: 1, usageValue: 730, usageMeasureId: 4 }),
        ]));
      }
      expect(products("public-addresses")).toHaveLength(2);
      expect(products("public-addresses").find(p => p.usageFactor === "upflow")).toMatchObject({ productNum: 3, usageValue: 120 });
      expect(products("public-addresses").find(p => p.resourceSpecCode === "5_bgp")).toMatchObject({ productNum: 3, usageValue: 730, usageMeasureId: 4 });
      expect(products("kafka")).toHaveLength(2);
      expect(products("kafka")).toEqual(expect.arrayContaining([
        expect.objectContaining({ resourceSpecCode: "dms.platinum.c6.kafka", resourceSize: 21, productNum: 2 }),
        expect.objectContaining({ resourceSpecCode: "dms.physical.storage.ultra.v2.kafka", resourceSize: 600, productNum: 2 }),
      ]));
      expect(products("rabbit")).toHaveLength(2);
      expect(products("rabbit")).toEqual(expect.arrayContaining([
        expect.objectContaining({ resourceSpecCode: "dms.platinum.c6.rabbitmq", resourceSize: 70, productNum: 1 }),
        expect.objectContaining({ resourceSpecCode: "dms.physical.storage.ultra.v2.rabbitmq", resourceSize: 500, productNum: 1 }),
      ]));
    } finally {
      await transport.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
