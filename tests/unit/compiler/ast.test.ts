import { describe, expect, it } from "bun:test";
import { parseQuoteYaml, validateQuoteAst } from "../../../src/core/compiler/ast.ts";
import { CalculatorError } from "../../../src/core/errors.ts";

describe("Declarative Quote AST Parser and Validator", () => {
  const validYaml = `
version: "1"

metadata:
  id: acme-infra
  customer: Acme Corp
  title_prefix: "Acme - Prod"
  currency: USD

horizon:
  duration: 1y
  billing_policy: as-specified

defaults:
  provider: huawei
  region: sa-brazil-1
  availability: multi-az

templates:
  worker_node:
    service: ecs
    needs:
      vcpus: 8
      memory: 32 GiB
    options:
      os: ubuntu-22.04

environments:
  prod:
    region: sa-brazil-1

resources:
  - id: worker-pool
    environment: prod
    use: worker_node
    quantity: 6
    billing: yearly

  - id: db-redis
    environment: prod
    service: redis
    quantity: 1
    needs:
      engine: redis-6.0
      topology: master-standby
      memory: 8 GiB
    billing: monthly
`;

  it("successfully parses and validates a compliant quote YAML document", () => {
    const doc = parseQuoteYaml(validYaml);
    expect(doc.version).toBe("1");
    expect(doc.metadata.customer).toBe("Acme Corp");
    expect(doc.horizon?.duration).toBe("1y");
    expect(doc.resources.length).toBe(2);
    expect(doc.templates?.worker_node?.service).toBe("ecs");
  });

  it("rejects non-object documents and malformed YAML", () => {
    expect(() => parseQuoteYaml("not a yaml object: [1, 2")).toThrow(CalculatorError);
    const res = validateQuoteAst("plain string");
    expect(res.ok).toBe(false);
  });

  it("rejects invalid or missing version", () => {
    const res = validateQuoteAst({
      version: "2",
      metadata: { id: "test", customer: "test" },
      resources: [{ id: "r1", service: "ecs" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some(e => e.path === "version")).toBe(true);
    }
  });

  it("rejects missing metadata id or customer", () => {
    const res = validateQuoteAst({
      version: "1",
      metadata: { id: "", customer: "  " },
      resources: [{ id: "r1", service: "ecs" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some(e => e.path === "metadata.id")).toBe(true);
      expect(res.errors.some(e => e.path === "metadata.customer")).toBe(true);
    }
  });

  it("rejects invalid horizon duration", () => {
    const res = validateQuoteAst({
      version: "1",
      metadata: { id: "test", customer: "test" },
      horizon: { duration: "3y" },
      resources: [{ id: "r1", service: "ecs" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some(e => e.path === "horizon.duration")).toBe(true);
    }
  });

  it("rejects duplicate resource IDs", () => {
    const res = validateQuoteAst({
      version: "1",
      metadata: { id: "test", customer: "test" },
      resources: [
        { id: "node-1", service: "ecs" },
        { id: "node-1", service: "ecs" },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some(e => e.message.includes("Duplicate resource id"))).toBe(true);
    }
  });

  it("rejects a resource without service or use template", () => {
    const res = validateQuoteAst({
      version: "1",
      metadata: { id: "test", customer: "test" },
      resources: [{ id: "orphan-resource" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some(e => e.message.includes("must specify either 'service' or 'use'"))).toBe(true);
    }
  });
});
