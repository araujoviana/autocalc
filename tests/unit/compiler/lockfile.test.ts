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
});
