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
