import { horizonAmount, priceUnit } from "../../../src/core/quote-file.ts";
import { describe, expect, it } from "bun:test";
import { compileQuote } from "../../../src/core/compiler/index.ts";
import { buildCanonicalQuoteIR } from "../../../src/core/compiler/ir.ts";
import {
  detectLockfileDrift,
  generateLockfile,
  parseLockfile,
  stringifyLockfile,
} from "../../../src/core/compiler/lockfile.ts";

describe("Lockfile Generator and Drift Detector", () => {
  const quoteYaml = `
version: "1"
metadata:
  id: test-lock-quote
  customer: Acme Global

defaults:
  region: sa-brazil-1
  availability: single-az
  billing: monthly

resources:
  - id: web-worker
    service: ecs
    quantity: 4
`;

  it("generates and round-trips a quote.lock.yaml document", () => {
    const compiled = compileQuote(quoteYaml);
    const ir = buildCanonicalQuoteIR(compiled.document, compiled.resources);
    ir.resources[0]!.skuCode = "ecs.c7.large.2";
    ir.resources[0]!.unitPrice = 120.5;
    ir.resources[0]!.totalPrice = 482.0;

    const lock = generateLockfile(ir, "11.4.201", [
      {
        index: 0,
        title: "Acme Global - Web",
        card_count: 1,
        estimated_bytes: 4096,
        share_link: "https://calculator.huaweicloud.com/#/share?token=abc",
      },
    ]);

    expect(lock.version).toBe("1");
    expect(lock.frontend_version).toBe("11.4.201");
    expect(lock.resources["web-worker"]?.sku_code).toBe("ecs.c7.large.2");
    expect(lock.resources["web-worker"]?.unit_price).toBe(120.5);
    expect(lock.shards.length).toBe(1);

    const yamlStr = stringifyLockfile(lock);
    const parsed = parseLockfile(yamlStr);
    expect(parsed.version).toBe("1");
    expect(parsed.input_hash).toBe(lock.input_hash);
    expect(parsed.resources["web-worker"]?.unit_price).toBe(120.5);
    expect(parsed.shards[0]?.share_link).toBe("https://calculator.huaweicloud.com/#/share?token=abc");
  });

  it("detects price drift against active catalog prices", () => {
    const compiled = compileQuote(quoteYaml);
    const ir = buildCanonicalQuoteIR(compiled.document, compiled.resources);
    ir.resources[0]!.skuCode = "ecs.c7.large.2";
    ir.resources[0]!.unitPrice = 100.0;

    const lock = generateLockfile(ir);

    // No drift when price matches
    const noDriftMap = new Map([["ecs.c7.large.2", 100.0]]);
    const rep1 = detectLockfileDrift(lock, noDriftMap);
    expect(rep1.hasDrift).toBe(false);
    expect(rep1.driftItems.length).toBe(0);

    // Drift detected when price changed
    const driftMap = new Map([["ecs.c7.large.2", 115.5]]);
    const rep2 = detectLockfileDrift(lock, driftMap);
    expect(rep2.hasDrift).toBe(true);
    expect(rep2.driftItems.length).toBe(1);
    expect(rep2.driftItems[0]?.delta).toBe(15.5);
    expect(rep2.netDifference).toBe(15.5);
  });

  it("persists and updates multiple partition shards with share URLs across plan/apply", () => {
    const compiled = compileQuote(quoteYaml);
    const ir = buildCanonicalQuoteIR(compiled.document, compiled.resources);
    ir.resources[0]!.skuCode = "ecs.c7.large.2";
    ir.resources[0]!.unitPrice = 120.5;
    ir.resources[0]!.totalPrice = 482.0;

    // Plan phase: records partition shards without URLs initially
    const plannedLock = generateLockfile(ir, undefined, [
      {
        index: 0,
        title: "Acme Global - Part 1",
        card_count: 200,
        estimated_bytes: 800_000,
      },
      {
        index: 1,
        title: "Acme Global - Part 2",
        card_count: 50,
        estimated_bytes: 180_000,
      },
    ]);

    expect(plannedLock.shards.length).toBe(2);
    expect(plannedLock.shards[0]!.title).toBe("Acme Global - Part 1");
    expect(plannedLock.shards[0]!.share_link).toBeUndefined();

    // Serialize to YAML as written by plan
    const yamlText = stringifyLockfile(plannedLock);
    const parsed = parseLockfile(yamlText);

    // Apply phase: updates share_id and share_link per verified shard
    parsed.shards[0]!.share_id = "L1-PART1";
    parsed.shards[0]!.share_link = "https://calculator.huaweicloud.com/#/share?token=part1";
    parsed.shards[1]!.share_id = "L2-PART2";
    parsed.shards[1]!.share_link = "https://calculator.huaweicloud.com/#/share?token=part2";

    const reSavedYaml = stringifyLockfile(parsed);
    const reLoaded = parseLockfile(reSavedYaml);

    expect(reLoaded.shards.length).toBe(2);
    expect(reLoaded.shards[0]!.share_id).toBe("L1-PART1");
    expect(reLoaded.shards[0]!.share_link).toBe("https://calculator.huaweicloud.com/#/share?token=part1");
    expect(reLoaded.shards[1]!.share_id).toBe("L2-PART2");
    expect(reLoaded.shards[1]!.share_link).toBe("https://calculator.huaweicloud.com/#/share?token=part2");
  });
});

describe("lockfile horizon totals", () => {
  it("projects hourly, monthly and yearly list prices over the horizon and flags per-request lines", () => {
    expect(priceUnit("rds", "ondemand")).toBe("hour");
    expect(priceUnit("redis", "monthly")).toBe("month");
    expect(priceUnit("ecs", "yearly")).toBe("year");
    expect(priceUnit("function", "ondemand")).toBe("request");
    expect(horizonAmount(0.1, "hour", 1)).toBeCloseTo(73, 9);
    expect(horizonAmount(0.1, "hour", 12)).toBeCloseTo(876, 9);
    expect(horizonAmount(36.55, "month", 12)).toBeCloseTo(438.6, 9);
    expect(horizonAmount(1200, "year", 12)).toBe(1200);
    expect(horizonAmount(1200, "year", 1)).toBe(100);
    expect(horizonAmount(5.86e-8, "request", 1)).toBeNull();
  });
});
