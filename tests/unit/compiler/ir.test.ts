import { describe, expect, it } from "bun:test";
import { compileQuote } from "../../../src/core/compiler/index.ts";
import { buildCanonicalQuoteIR, computeInputHash } from "../../../src/core/compiler/ir.ts";

describe("Canonical Resource IR Builder", () => {
  const quoteYaml = `
version: "1"
metadata:
  id: test-ir-quote
  customer: Fintech SA
  title_prefix: "Fintech - Core"
  currency: USD

horizon:
  duration: 1y

defaults:
  region: sa-brazil-1
  availability: single-az
  billing: monthly

resources:
  - id: app-server
    service: ecs
    quantity: 2
    needs:
      vcpus: 4
      memory: "16 GiB"
`;

  it("builds canonical resource IR with input hash and default physical card mapping", () => {
    const compiled = compileQuote(quoteYaml);
    const ir = buildCanonicalQuoteIR(compiled.document, compiled.resources);

    expect(ir.version).toBe("1");
    expect(ir.metadata.id).toBe("test-ir-quote");
    expect(ir.metadata.customer).toBe("Fintech SA");
    expect(ir.horizon.duration).toBe("1y");
    expect(ir.horizon.effectiveMonths).toBe(12);
    expect(ir.resources.length).toBe(1);

    const res = ir.resources[0]!;
    expect(res.id).toBe("app-server");
    expect(res.service).toBe("ecs");
    expect(res.region).toBe("sa-brazil-1");
    expect(res.physicalCards.length).toBe(1);
    expect(res.physicalCards[0]!.cardId).toBe("app-server-0");
    expect(res.physicalCards[0]!.title).toBe("app-server");
    expect(ir.inputHash).toBeDefined();
    expect(ir.inputHash.length).toBe(64); // SHA-256 hex string
  });

  it("generates deterministic input hashes for identical documents", () => {
    const c1 = compileQuote(quoteYaml);
    const c2 = compileQuote(quoteYaml);
    const h1 = computeInputHash(c1.document, c1.resources);
    const h2 = computeInputHash(c2.document, c2.resources);
    expect(h1).toBe(h2);
  });
});
