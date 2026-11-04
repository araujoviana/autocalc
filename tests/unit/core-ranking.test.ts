import { expect, test } from "bun:test";
import { autoConfirmable, num, rank } from "../../src/core/quote/ranking.ts";
import { candidate, requirement } from "../../src/core/quote/model.ts";

const REQ = requirement({ id: "r", service: "ecs", region: "sa-brazil-1", billing: "monthly", needs: { vcpus: 4, memory_gb: 16 } });
const cand = (spec: string, vcpus: number, mem: number, price: string, gen = 0) =>
  candidate(spec, "sa-brazil-1", "monthly", price, { vcpus, memory_gb: mem }, gen);

test("covering beats cheaper and non-covering is last", () => {
  const r = rank(REQ, [cand("small", 2, 8, "10"), cand("big", 8, 32, "80")]);
  expect(r.map(x => x.candidate.spec)).toEqual(["big", "small"]);
  expect(r.map(x => x.covers)).toEqual([true, false]);
  expect(r[1]!.reason).toBe("misses 4 vCPU (has 2), 16 GB (has 8)");
});

test("ties fall through to price then generation", () => {
  const r = rank(REQ, [cand("old", 4, 16, "50", 6), cand("new", 4, 16, "50", 7), cand("cheap", 4, 16, "40", 5)]);
  expect(r.map(x => x.candidate.spec)).toEqual(["cheap", "new", "old"]);
});

test("cheapest of three exact matches reason", () => {
  const r = rank(REQ, [cand("a", 4, 16, "60"), cand("b", 4, 16, "50"), cand("c", 4, 16, "70")]);
  expect(r[0]!.reason).toBe("covers 4 vCPU/16 GB; cheapest of 3 exact matches");
  expect(r[1]!.reason).toBe("exact match; 10 above the cheapest exact match");
  expect(autoConfirmable(r)).toBe(true);
});

test("a size-up is not exact and says by how much", () => {
  const r = rank(REQ, [cand("up", 4, 32, "70"), cand("up2", 8, 32, "90")]);
  expect(autoConfirmable(r)).toBe(false);
  expect(r[0]!.reason).toBe("covers 4 vCPU/16 GB with +16 GB; closest of 2 covering");
  expect(r[1]!.reason).toBe("covers 4 vCPU/16 GB with +4 vCPU, +16 GB");
});

test("a named spec makes exact and a missing spec blocks auto", () => {
  const pinned = requirement({ id: "r", service: "ecs", region: "x", billing: "monthly", needs: REQ.needs, spec: "named" });
  const r = rank(pinned, [cand("other", 4, 16, "40"), cand("named", 4, 16, "50")]);
  expect(r[0]!.candidate.spec).toBe("named");
  expect(autoConfirmable(r)).toBe(true);
  expect(autoConfirmable(rank(pinned, [cand("other", 4, 16, "40")]))).toBe(false);
});

test("nothing requested is never exact, and no candidates is empty", () => {
  expect(autoConfirmable(rank(requirement({ id: "r", service: "ecs", region: "x", billing: "monthly" }), [cand("a", 1, 1, "1")]))).toBe(false);
  expect(rank(REQ, [])).toEqual([]);
  expect(autoConfirmable([])).toBe(false);
});

test("a spec-only requirement reads 'named spec'", () => {
  const byName = requirement({ id: "r", service: "ecs", region: "x", billing: "monthly", spec: "s1" });
  expect(rank(byName, [candidate("s1", "x", "monthly", "5")])[0]!.reason).toBe("covers named spec s1; exact match");
});

test("a missing statement of size is reported as 'not stated'", () => {
  expect(rank(REQ, [candidate("x", "r", "monthly", "1")])[0]!.reason).toBe("misses 4 vCPU (has not stated), 16 GB (has not stated)");
});

test("num matches Python's %g", () => {
  expect([4, 16, 0.5, 1.5, 100000, 1000000, 0.0001, 0.00001, 12345.678, 0].map(num))
    .toEqual(["4", "16", "0.5", "1.5", "100000", "1e+06", "0.0001", "1e-05", "12345.7", "0"]);
});
