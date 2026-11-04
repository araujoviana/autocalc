import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CalculatorError } from "../../src/core/errors.ts";
import { decide, decideMany, draftQuote } from "../../src/core/quote/draft.ts";
import { candidate, requirement, type Requirement } from "../../src/core/quote/model.ts";
import { RunRecord } from "../../src/core/quote/runs.ts";
import { DraftStore } from "../../src/core/quote/store.ts";

const fake = {
  name: "fake",
  async candidates(req: Requirement) {
    const sizes: Record<string, [number, number, string][]> = { exact: [[4, 16, "50"], [4, 16, "60"]], bigger: [[4, 32, "70"]] };
    return sizes[req.spec ?? req.id]!.map(([v, m, p], i) => candidate(`s${i}`, req.region, req.billing, p, { vcpus: v, memory_gb: m }));
  },
};
const needs = { vcpus: 4, memory_gb: 16 };
const reqs = () => [requirement({ id: "exact", service: "ecs", region: "sa-brazil-1", billing: "monthly", needs }),
  requirement({ id: "bigger", service: "ecs", region: "la-south-2", billing: "monthly", needs })];
const fresh = async () => { const root = await mkdtemp(join(tmpdir(), "autocalc-draft-")); return { root, store: new DraftStore(root) }; };

test("exact is auto-decided, inexact stays pending, and a human decides it", async () => {
  const { root, store } = await fresh();
  const d = await draftQuote(fake, "acme", reqs(), store);
  expect(d.decisions).toHaveLength(1);
  expect(d.decisions[0]).toMatchObject({ requirement_id: "exact", by: "auto", justification: "covers 4 vCPU/16 GB; cheapest of 2 exact matches" });
  expect(d.pending()).toEqual(["bigger"]);
  const d2 = await decide(store, d.id, "bigger", "s0", "customer approved +16 GB");
  expect(d2.pending()).toEqual([]);
  expect(d2.decisions.at(-1)!.by).toBe("human");
  expect(await store.load(d.id)).toEqual(d2);
  const kinds = (await new RunRecord(root, d.id).read()).map(e => e.kind);
  const count = (k: string) => kinds.filter(x => x === k).length;
  expect([count("requirement"), count("candidates"), count("decision"), count("step")]).toEqual([2, 2, 2, 2]);
  await rm(root, { recursive: true });
});

test("decide refuses a spec that was not a candidate, and lists the real ones", async () => {
  const { root, store } = await fresh();
  const d = await draftQuote(fake, "acme", reqs(), store);
  const error = await decide(store, d.id, "bigger", "typo", "why").catch(e => e);
  expect(error).toBeInstanceOf(CalculatorError);
  expect(error.details.allowed).toEqual(["s0"]);
  await rm(root, { recursive: true });
});

test("a bad batch persists nothing", async () => {
  const { root, store } = await fresh();
  const d = await draftQuote(fake, "acme", reqs(), store);
  const batch = [{ requirement_id: "bigger", spec: "s0", justification: "ok" }, { requirement_id: "exact", spec: "nope", justification: "no" }];
  await expect(decideMany(store, d.id, batch)).rejects.toThrow(CalculatorError);
  expect((await store.load(d.id)).pending()).toEqual(["bigger"]);
  await rm(root, { recursive: true });
});

test.each([
  [[]], [[{ requirement_id: "bigger", spec: "s0" }]], [[{ requirement_id: "bigger", spec: "s0", justification: "x", extra: "y" }]],
  [[{ requirement_id: "bigger", spec: "s0", justification: "x" }, { requirement_id: "bigger", spec: "s0", justification: "y" }]],
])("malformed decision batches are refused: %o", async batch => {
  const { root, store } = await fresh();
  const d = await draftQuote(fake, "acme", reqs(), store);
  await expect(decideMany(store, d.id, batch as never)).rejects.toThrow(CalculatorError);
  await rm(root, { recursive: true });
});

test("a published or publishing draft cannot be revised", async () => {
  const { root, store } = await fresh();
  const d = await draftQuote(fake, "acme", reqs(), store);
  d.publishing = true; await store.save(d);
  await expect(decide(store, d.id, "bigger", "s0", "why")).rejects.toThrow(/cannot be revised/);
  await rm(root, { recursive: true });
});

test("duplicate ids, no requirements, a blank customer and AZs are refused", async () => {
  const { root, store } = await fresh();
  await expect(draftQuote(fake, "acme", [...reqs(), reqs()[0]!], store)).rejects.toThrow(/unique/);
  await expect(draftQuote(fake, "acme", [], store)).rejects.toThrow(/at least one/);
  await expect(draftQuote(fake, " ", reqs(), store)).rejects.toThrow(/customer/i);
  await expect(draftQuote(fake, "acme", [requirement({ id: "x", service: "ecs", region: "r", billing: "monthly", az: "az1" })], store)).rejects.toThrow(/Availability-zone/);
  await rm(root, { recursive: true });
});
