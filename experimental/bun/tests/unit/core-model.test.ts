import { expect, test } from "bun:test";
import { CalculatorError } from "../../src/core/errors.ts";
import { Draft, candidate, candidateFromJSON, candidateToJSON, requirement, requirementFromJSON } from "../../src/core/quote/model.ts";
import { compareDecimal, formatDecimal, parseDecimal, subDecimal } from "../../src/core/quote/decimal.ts";

function makeDraft(): Draft {
  const d = new Draft("d-00000001", "acme", "huawei", [
    requirement({ id: "a", service: "ecs", region: "sa-brazil-1", billing: "monthly", quantity: 2, needs: { vcpus: 4, memory_gb: 16 }, az: "az1" }),
    requirement({ id: "b", service: "ecs", region: "la-south-2", billing: "ondemand", spec: "c7n.large.2" }),
  ]);
  d.addDecision({ requirement_id: "a", spec: "c7n.xlarge.4", by: "auto", justification: "covers 4 vCPU/16 GB; exact match" });
  return d;
}

test("a draft round-trips through JSON keeping regions, az and decisions", () => {
  const d = makeDraft(), back = Draft.fromJSON(JSON.parse(JSON.stringify(d)));
  expect(back).toEqual(d);
  expect(new Set(back.requirements.map(r => r.region))).toEqual(new Set(["sa-brazil-1", "la-south-2"]));
  expect(back.requirements[0]!.az).toBe("az1");
  expect(back.pending()).toEqual(["b"]);
});

test("requirement JSON keeps Python's key order and nulls", () => {
  expect(Object.keys(requirement({ id: "a", service: "ecs", region: "r", billing: "monthly" }))).toEqual(
    ["id", "service", "region", "billing", "quantity", "needs", "spec", "az", "group", "options"]);
  expect(requirementFromJSON({ id: "a", service: "ecs", region: "r", billing: "monthly" }).spec).toBeNull();
});

test("a candidate price round-trips exactly", () => {
  const c = candidate("x", "r", "monthly", "0.1234567", { vcpus: 2 });
  expect(candidateFromJSON(candidateToJSON(c))).toEqual(c);
  expect(candidateToJSON(c).price).toBe("0.1234567");
});

test.each([
  [{ requirement_id: "a", spec: "s", by: "human", justification: "  " }],
  [{ requirement_id: "zzz", spec: "s", by: "human", justification: "why" }],
  [{ requirement_id: "a", spec: "s", by: "robot", justification: "why" }],
])("bad decisions are refused: %o", decision => {
  expect(() => makeDraft().addDecision(decision)).toThrow(CalculatorError);
});

test("an unknown requirement lists the legal ids", () => {
  try { makeDraft().addDecision({ requirement_id: "zzz", spec: "s", by: "human", justification: "why" }); expect.unreachable(); }
  catch (error) { expect((error as CalculatorError).details).toEqual({ field: "requirement_id", allowed: ["a", "b"] }); }
});

test("a new decision replaces the old one", () => {
  const d = makeDraft();
  d.addDecision({ requirement_id: "a", spec: "other", by: "human", justification: "size-up approved" });
  expect(d.decisions.filter(x => x.requirement_id === "a").map(x => x.spec)).toEqual(["other"]);
});

test.each([
  [{ id: "", service: "ecs", region: "r", billing: "monthly" }],
  [{ id: "a", service: "ecs", region: "r", billing: "weekly" }],
  [{ id: "a", service: "ecs", region: "r", billing: "monthly", quantity: 0 }],
  [{ id: "a", service: "ecs", region: "r", billing: "monthly", quantity: 1.5 }],
  [{ id: "a", service: "ecs", region: "r", billing: "monthly", needs: { gpu: 1 } }],
  [{ id: "a", service: "ecs", region: "r", billing: "monthly", needs: { vcpus: -1 } }],
  [{ id: "a", service: "ecs", region: "r", billing: "monthly", needs: { vcpus: Infinity } }],
  [{ id: "a", service: "ecs", region: "r", billing: "monthly", az: " " }],
])("an invalid requirement is refused: %o", input => {
  expect(() => requirement(input)).toThrow(CalculatorError);
});

test("requirement JSON with unknown or missing keys is refused", () => {
  expect(() => requirementFromJSON({ id: "a", service: "ecs", region: "r", billing: "monthly", color: "red" })).toThrow(/unknown/);
  expect(() => requirementFromJSON({ id: "a" })).toThrow(/missing/);
  expect(() => requirementFromJSON("a")).toThrow(CalculatorError);
});

test("decimals compare, subtract and format exactly", () => {
  expect(compareDecimal(parseDecimal("0.1"), parseDecimal("0.10"))).toBe(0);
  expect(compareDecimal(parseDecimal("1e-7"), parseDecimal("0.0000001"))).toBe(0);
  expect(formatDecimal(subDecimal(parseDecimal("60"), parseDecimal("50")))).toBe("10");
  expect(formatDecimal(subDecimal(parseDecimal("0.3"), parseDecimal("0.1")))).toBe("0.2");
  expect(formatDecimal(parseDecimal("1E+3"))).toBe("1000");
  expect(formatDecimal(subDecimal(parseDecimal("1"), parseDecimal("1.5")))).toBe("-0.5");
  expect(() => parseDecimal("abc")).toThrow(RangeError);
});
