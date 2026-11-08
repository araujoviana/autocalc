import { describe, expect, it } from "bun:test";
import { parseQuoteYaml } from "../../../src/core/compiler/ast.ts";
import { expandResources } from "../../../src/core/compiler/expander.ts";
import { CalculatorError } from "../../../src/core/errors.ts";

describe("Machine Archetype Template Expander", () => {
  const docYaml = `
version: "1"
metadata:
  id: test-cluster
  customer: Test Corp

defaults:
  region: sa-brazil-1
  availability: single-az
  billing: monthly

templates:
  k8s_worker:
    service: ecs
    needs:
      vcpus: 4
      memory: 16 GiB
    options:
      os: ubuntu-22.04
      system_disk:
        type: high-io
        size: 50 GiB

environments:
  dmz:
    region: la-south-2
    availability: multi-az
  prod:
    region: sa-brazil-1

resources:
  - id: worker-standard
    use: k8s_worker
    quantity: 3

  - id: worker-large
    environment: dmz
    use: k8s_worker
    quantity: 2
    billing: yearly
    needs:
      memory: 32 GiB
    options:
      system_disk:
        size: 100 GiB

  - id: standalone-db
    environment: prod
    service: rds
    billing: monthly
    needs:
      engine: postgresql
`;

  it("expands machine templates with default settings", () => {
    const doc = parseQuoteYaml(docYaml);
    const expanded = expandResources(doc);
    expect(expanded.length).toBe(3);

    const std = expanded[0]!;
    expect(std.id).toBe("worker-standard");
    expect(std.service).toBe("ecs");
    expect(std.quantity).toBe(3);
    expect(std.region).toBe("sa-brazil-1");
    expect(std.billing).toBe("monthly");
    expect(std.availability).toBe("single-az");
    expect(std.needs?.vcpus).toBe(4);
    expect(std.needs?.memory).toBe("16 GiB");
    expect((std.options?.system_disk as any)?.size).toBe("50 GiB");
  });

  it("applies per-resource overrides and environment settings over template defaults", () => {
    const doc = parseQuoteYaml(docYaml);
    const expanded = expandResources(doc);

    const lrg = expanded[1]!;
    expect(lrg.id).toBe("worker-large");
    expect(lrg.region).toBe("la-south-2"); // inherited from dmz
    expect(lrg.availability).toBe("multi-az"); // inherited from dmz
    expect(lrg.billing).toBe("yearly"); // overridden on card
    expect(lrg.quantity).toBe(2);
    expect(lrg.needs?.vcpus).toBe(4); // kept from template
    expect(lrg.needs?.memory).toBe("32 GiB"); // overridden on card
    expect((lrg.options?.system_disk as any)?.type).toBe("high-io"); // kept from template
    expect((lrg.options?.system_disk as any)?.size).toBe("100 GiB"); // overridden on card
  });

  it("rejects undefined template reference with helpful error", () => {
    const invalidYaml = `
version: "1"
metadata: { id: x, customer: c }
resources:
  - id: bad-ref
    use: non_existent_template
`;
    const doc = parseQuoteYaml(invalidYaml);
    expect(() => expandResources(doc)).toThrow(CalculatorError);
  });

  it("rejects resource without region", () => {
    const noRegionYaml = `
version: "1"
metadata: { id: x, customer: c }
resources:
  - id: r1
    service: ecs
`;
    const doc = parseQuoteYaml(noRegionYaml);
    expect(() => expandResources(doc)).toThrow(CalculatorError);
  });

  it("normalizes geographic location names to canonical region IDs offline", () => {
    const locationYaml = `
version: "1"
metadata: { id: x, customer: c }
defaults:
  region: "São Paulo"
  billing: monthly
resources:
  - id: r1
    service: ecs
    needs: { vcpus: 2, memory: 4 GiB }
  - id: r2
    service: ecs
    region: "Santiago, Chile"
    needs: { vcpus: 2, memory: 4 GiB }
`;
    const doc = parseQuoteYaml(locationYaml);
    const expanded = expandResources(doc);
    expect(expanded[0]!.region).toBe("sa-brazil-1");
    expect(expanded[1]!.region).toBe("la-south-2");
  });
});
