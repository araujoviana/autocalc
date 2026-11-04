import { describe, expect, it } from "bun:test";
import { compileQuote } from "../../../src/core/compiler/index.ts";
import { CalculatorError } from "../../../src/core/errors.ts";

describe("Declarative Quote Compiler Pipeline", () => {
  const fullQuoteYaml = `
version: "1"

metadata:
  id: qitech-fintech-quote
  customer: Acme FinTech
  title_prefix: "Acme - Prod"
  currency: USD

horizon:
  duration: 1y
  billing_policy: as-specified

defaults:
  provider: huawei
  region: sa-brazil-1
  availability: multi-az
  billing: monthly

templates:
  k8s_worker:
    service: ecs
    needs:
      vcpus: 8
      memory: "32 GiB"
    options:
      os: ubuntu-22.04

environments:
  dmz:
    region: sa-brazil-1
  prod:
    region: sa-brazil-1

resources:
  - id: worker-nodes
    environment: prod
    use: k8s_worker
    quantity: 6
    billing: yearly

  - id: archive-storage
    environment: prod
    service: obs
    billing: ondemand
    options:
      storage_class: standard
      capacity: "95043 GB"
      traffic: "150 TB/mo"
`;

  it("compiles the entire quote pipeline in under 50ms without network", () => {
    const t0 = performance.now();
    const compiled = compileQuote(fullQuoteYaml);
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(50);
    expect(compiled.document.version).toBe("1");
    expect(compiled.resources.length).toBe(2);

    const worker = compiled.resources[0]!;
    expect(worker.id).toBe("worker-nodes");
    expect(worker.service).toBe("ecs");
    expect(worker.quantity).toBe(6);
    expect(worker.billing).toBe("yearly");
    expect(worker.horizon.duration).toBe("1y");
    expect(worker.horizon.effectiveMonths).toBe(12);

    const obs = compiled.resources[1]!;
    expect(obs.id).toBe("archive-storage");
    expect(obs.service).toBe("obs");
    expect(obs.billing).toBe("ondemand");
    expect(obs.horizon.duration).toBe("1y");
    expect(obs.horizon.effectiveHours).toBe(8760);
    expect(obs.horizon.effectiveMonths).toBe(12);
    expect(obs.horizon.metricMultiplier).toBe(12);
  });

  it("catches bare numbers in dimensional option fields during compilation", () => {
    const badUnitYaml = `
version: "1"
metadata: { id: x, customer: c }
resources:
  - id: bad-obs
    service: obs
    region: sa-brazil-1
    options:
      capacity: 95043
`;
    expect(() => compileQuote(badUnitYaml)).toThrow(CalculatorError);
  });
});
