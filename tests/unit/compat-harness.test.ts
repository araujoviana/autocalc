import { describe, expect, test } from "bun:test";
import { diffProducts } from "../support/compat/harness.ts";
import { formatCompatReport } from "../support/compat/run.ts";
import type { Result } from "../support/compat/replay.ts";

describe("Compatibility Harness and Runner", () => {
  test("equal products produce no diff, including null versus undefined", () => {
    const a = [
      { usageFactor: "get", usageValue: 10, usageMeasureId: 54, productNum: 1 },
      { resourceSpecCode: "obs.storage.10tb", productNum: 1 },
    ];
    const b = [
      { usageFactor: "get", usageValue: "10", usageMeasureId: 54, productNum: 1 },
      { resourceSpecCode: "obs.storage.10tb", usageValue: null, productNum: 1 },
    ];
    expect(diffProducts(a, b)).toEqual([]);
  });

  test("a swapped value, a missing line and an extra line are all reported", () => {
    const built = [
      { usageFactor: "delete_warm", usageValue: 63, usageMeasureId: 31, productNum: 1 },
      { usageFactor: "put_warm", usageValue: 5, usageMeasureId: 31, productNum: 1 },
    ];
    const page = [
      { usageFactor: "delete_warm", usageValue: 0, usageMeasureId: 31, productNum: 1 },
      { usageFactor: "get_warm", usageValue: 1, usageMeasureId: 31, productNum: 1 },
    ];
    expect(diffProducts(built, page).map((d) => d.key).sort()).toEqual([
      ":delete_warm",
      ":get_warm",
      ":put_warm",
    ]);
  });

  test("formatCompatReport preserves effective-region labels when scenario overrides default region", () => {
    const results: Result[] = [
      {
        name: "sp-scenario",
        ok: true,
        stage: "ok",
        effectiveRegion: "sa-brazil-1",
      },
      {
        name: "santiago-scenario",
        ok: true,
        stage: "ok",
        effectiveRegion: "la-south-2",
      },
    ];

    const report = formatCompatReport("cce", "sa-brazil-1", results);
    expect(report).toContain("| sp-scenario | sa-brazil-1 | ok | ok |");
    expect(report).toContain("| santiago-scenario | la-south-2 | ok | ok |");
  });

  test("diffProducts detects resourceSize difference", () => {
    const a = [{ resourceSpecCode: "GPSSD", resourceSize: 100, productNum: 1 }];
    const b = [{ resourceSpecCode: "GPSSD", resourceSize: 999, productNum: 1 }];
    expect(diffProducts(a, b).length).toBeGreaterThan(0);
  });

  test("diffProducts detects regionId difference", () => {
    const a = [{ resourceSpecCode: "GPSSD", regionId: "sa-brazil-1", productNum: 1 }];
    const b = [{ resourceSpecCode: "GPSSD", regionId: "la-south-2", productNum: 1 }];
    expect(diffProducts(a, b).length).toBeGreaterThan(0);
  });

  test("diffProducts detects lost multiplicity when two identical product lines are reduced to one", () => {
    const a = [
      { resourceSpecCode: "GPSSD", resourceSize: 100, productNum: 1 },
      { resourceSpecCode: "GPSSD", resourceSize: 100, productNum: 1 },
    ];
    const b = [
      { resourceSpecCode: "GPSSD", resourceSize: 100, productNum: 1 },
    ];
    expect(diffProducts(a, b).length).toBeGreaterThan(0);
  });

  test("diffProducts rejects missing metadata as equality (Codex finding 3)", () => {
    // Missing regionId must not wildcard-match a concrete region
    const diffRegion = diffProducts(
      [{ resourceSpecCode: "disk", productNum: 1, resourceSize: 100, regionId: "sa-brazil-1" }],
      [{ resourceSpecCode: "disk", productNum: 1, resourceSize: 100 }]
    );
    expect(diffRegion.length).toBeGreaterThan(0);
    expect(diffRegion[0]!.differences?.region).toEqual({ builder: "sa-brazil-1", page: null });

    // Missing billing mode must not wildcard-match YEARLY
    const diffBilling = diffProducts(
      [{ resourceSpecCode: "disk", productNum: 1, billingMode: "YEARLY" }],
      [{ resourceSpecCode: "disk", productNum: 1 }]
    );
    expect(diffBilling.length).toBeGreaterThan(0);
    expect(diffBilling[0]!.differences?.billingMode).toEqual({ builder: "YEARLY", page: null });

    // With explicit card-level context, omitted field is verified through context
    const withContext = diffProducts(
      [{ resourceSpecCode: "disk", productNum: 1, resourceSize: 100, regionId: "sa-brazil-1" }],
      [{ resourceSpecCode: "disk", productNum: 1, resourceSize: 100 }],
      { region: "sa-brazil-1" }
    );
    expect(withContext).toEqual([]);
  });

  test("diffProducts is strictly order-independent across permutations (Codex finding 4)", () => {
    const p = { resourceSpecCode: "disk", productNum: 1, resourceSize: 100 };
    const a = [p, { ...p, regionId: "sa-brazil-1" }];
    const b1 = [{ ...p, regionId: "sa-brazil-1" }, { ...p, regionId: "la-south-2" }];
    const b2 = [b1[1]!, b1[0]!]; // Permuted order: [la-south-2, sa-brazil-1]

    const diff1 = diffProducts(a, b1);
    const diff2 = diffProducts(a, b2);

    expect(diff1.length).toBe(1);
    expect(diff2.length).toBe(1);
    expect(diff1[0]!.differences?.region).toEqual({ builder: null, page: "la-south-2" });
    expect(diff2[0]!.differences?.region).toEqual({ builder: null, page: "la-south-2" });
  });

  test("diffProducts permutation invariant property test", () => {
    const items: Array<Record<string, any>> = [
      { resourceSpecCode: "disk-1", resourceSize: 100, regionId: "sa-brazil-1", billingMode: "ONDEMAND", productNum: 1 },
      { resourceSpecCode: "disk-1", resourceSize: 200, regionId: "sa-brazil-1", billingMode: "MONTHLY", productNum: 2 },
      { resourceSpecCode: "net-1", usageFactor: "upflow", usageValue: 50, regionId: "sa-brazil-1", productNum: 1 },
      { resourceSpecCode: "vm-1", resourceSize: 4, regionId: "la-south-2", billingMode: "YEARLY", productNum: 1 },
    ];

    // Same items in reversed / shuffled orders must always produce empty diff
    const shuffled1 = [items[2]!, items[0]!, items[3]!, items[1]!];
    const shuffled2 = [items[1]!, items[3]!, items[0]!, items[2]!];
    expect(diffProducts(items, shuffled1)).toEqual([]);
    expect(diffProducts(shuffled1, shuffled2)).toEqual([]);

    // Corrupted item placed at different positions must produce identical diff
    const corruptedA = [...items];
    corruptedA[1] = { ...corruptedA[1]!, resourceSize: 999 };

    const perm1 = [corruptedA[0]!, corruptedA[1]!, corruptedA[2]!, corruptedA[3]!];
    const perm2 = [corruptedA[3]!, corruptedA[2]!, corruptedA[1]!, corruptedA[0]!];

    const d1 = diffProducts(perm1, items);
    const d2 = diffProducts(perm2, items);
    expect(d1.length).toBe(1);
    expect(d2.length).toBe(1);
    expect(d1[0]!.differences?.resourceSize).toEqual({ builder: 999, page: 200 });
    expect(d2[0]!.differences?.resourceSize).toEqual({ builder: 999, page: 200 });
  });

  test("diffProducts 500 generated multisets property test with seed 20261111", () => {
    let seed = 20261111;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    function shuffle<T>(values: T[]): T[] {
      const result = [...values];
      for (let i = result.length - 1; i > 0; i--) {
        const j = random() % (i + 1);
        [result[i], result[j]] = [result[j]!, result[i]!];
      }
      return result;
    }

    const fields = [
      "resourceSize",
      "productNum",
      "usageValue",
      "usageMeasureId",
      "resouceSizeMeasureId",
      "regionId",
      "billingMode",
      "cloudServiceType",
      "resourceType",
    ];

    for (let iteration = 0; iteration < 500; iteration++) {
      const rows: Record<string, any>[] = Array.from({ length: 1 + (random() % 8) }, () => ({
        resourceSpecCode: `spec${random() % 3}`,
        usageFactor: "duration",
        resourceSize: 1 + (random() % 1000),
        productNum: 1 + (random() % 9),
        usageValue: 1 + (random() % 730),
        usageMeasureId: 4,
        resouceSizeMeasureId: 17,
        regionId: random() % 2 ? "sa-brazil-1" : "la-south-2",
        billingMode: "ONDEMAND",
        cloudServiceType: "c",
        resourceType: "r",
      }));

      // Permutations of identical multisets must yield 0 diffs
      expect(diffProducts(rows, shuffle(rows)).length).toBe(0);

      const index = random() % rows.length;
      for (const field of fields) {
        const changed = rows.map((row) => ({ ...row }));
        const value = changed[index]![field]!;
        changed[index]![field] = typeof value === "number" ? value + 1 : `${value}-changed`;
        expect(diffProducts(rows, shuffle(changed)).length).toBeGreaterThan(0);

        const missing = rows.map((row) => ({ ...row }));
        delete missing[index]![field];
        expect(diffProducts(rows, shuffle(missing)).length).toBeGreaterThan(0);
      }

      // Multiplicity: adding duplicate row must be caught
      expect(diffProducts([...rows, rows[index]!], shuffle(rows)).length).toBeGreaterThan(0);
    }
  });

  test("formatCompatReport marks blocked transport failures separately from logic failures", () => {
    const results: Result[] = [
      {
        name: "blocked-scenario",
        ok: false,
        stage: "blocked",
        effectiveRegion: "sa-brazil-1",
        blocker: "ECONNRESET connection reset by peer",
      },
    ];

    const report = formatCompatReport("cce", "sa-brazil-1", results);
    expect(report).toContain("BLOCKED");
    expect(report).toContain("ECONNRESET");
  });
});
