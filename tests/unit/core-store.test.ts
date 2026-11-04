import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CalculatorError } from "../../src/core/errors.ts";
import { Draft, requirement } from "../../src/core/quote/model.ts";
import { RunRecord } from "../../src/core/quote/runs.ts";
import { DraftStore, dataDir } from "../../src/core/quote/store.ts";

const temp = () => mkdtemp(join(tmpdir(), "autocalc-store-"));
function makeDraft(customer = "acme") {
  const d = new Draft(DraftStore.newId(), customer, "huawei", [requirement({ id: "a", service: "ecs", region: "sa-brazil-1", billing: "monthly" })]);
  d.addDecision({ requirement_id: "a", spec: "s", by: "human", justification: "why" });
  return d;
}

test("round trip, saving twice, and no temp file left", async () => {
  const root = await temp(), s = new DraftStore(root), d = makeDraft();
  await s.save(d); await s.save(d);
  expect(await s.load(d.id)).toEqual(d);
  expect(await readdir(s.dir)).toEqual([`${d.id}.json`]);
  await rm(root, { recursive: true });
});

test.each(["d-deadbeef", "../etc/passwd", "d-DEADBEEF", "d-1234567"])("unknown and malformed ids name the id: %s", async bad => {
  const root = await temp();
  const error = await new DraftStore(root).load(bad).catch(e => e);
  expect(error).toBeInstanceOf(CalculatorError);
  expect(error.message).toContain("No draft");
  expect(error.message).toContain(bad);
  await rm(root, { recursive: true });
});

test("list is newest first and empty for a missing store", async () => {
  const root = await temp(), s = new DraftStore(root), a = makeDraft("first"), b = makeDraft("second");
  await s.save(a); await s.save(b);
  await utimes(join(s.dir, `${a.id}.json`), 1, 1);
  expect((await s.list()).map(x => x.customer)).toEqual(["second", "first"]);
  expect(await new DraftStore(join(root, "empty")).list()).toEqual([]);
  await rm(root, { recursive: true });
});

test("the default root follows AUTOCALC_DATA", () => {
  expect(dataDir({ AUTOCALC_DATA: "/somewhere" })).toBe("/somewhere");
  expect(dataDir({})).toMatch(/\.local\/share\/autocalc$/);
});

test("a lock excludes concurrent work on the same draft, and is released on failure", async () => {
  const root = await temp(), s = new DraftStore(root), log: string[] = [];
  const job = (name: string) => s.lock("d-00000001", async () => { log.push(`${name}:in`); await new Promise(r => setTimeout(r, 40)); log.push(`${name}:out`); });
  await Promise.all([job("a"), job("b")]);
  expect(["a:in,a:out,b:in,b:out", "b:in,b:out,a:in,a:out"]).toContain(log.join(",")); // never interleaved
  await expect(s.lock("d-00000001", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  await s.lock("d-00000001", async () => {}); // would hang if the failed one kept the lock
  await rm(root, { recursive: true });
});

test("a lock left by a dead process is reaped", async () => {
  const root = await temp(), s = new DraftStore(root);
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(join(s.dir, "d-00000002.lockdir"), { recursive: true });
  await writeFile(join(s.dir, "d-00000002.lockdir", "pid"), "999999999");
  expect(await s.lock("d-00000002", async () => "ok")).toBe("ok");
  await rm(root, { recursive: true });
});

test("inspect reports pending, ready, unknown_outcome and published", async () => {
  const root = await temp(), s = new DraftStore(root), d = makeDraft();
  d.decisions = [];
  await s.save(d);
  expect((await s.inspect(d.id)).state).toBe("pending");
  d.addDecision({ requirement_id: "a", spec: "s", by: "human", justification: "why" });
  await s.save(d);
  expect((await s.inspect(d.id)).state).toBe("ready");
  d.publishing = true; await s.save(d);
  expect((await s.inspect(d.id)).state).toBe("unknown_outcome");
  d.publication = { list_id: "x" }; await s.save(d);
  expect((await s.inspect(d.id)).state).toBe("published");
  await rm(root, { recursive: true });
});

test("recover needs an explicit confirmation and a justification, and logs it", async () => {
  const root = await temp(), s = new DraftStore(root), d = makeDraft();
  d.publishing = true; await s.save(d);
  await expect(s.recover(d.id, false, "checked")).rejects.toThrow(/explicitly confirm/);
  await expect(s.recover(d.id, true, "  ")).rejects.toThrow(/justification/);
  expect(await s.recover(d.id, true, "no list in my account")).toEqual({ draft_id: d.id, state: "ready" });
  expect((await s.load(d.id)).publishing).toBe(false);
  expect((await new RunRecord(root, d.id).read()).map(e => e.kind)).toEqual(["publication_recovery"]);
  await expect(s.recover(d.id, true, "again")).rejects.toThrow(/unknown outcome/);
  await rm(root, { recursive: true });
});

test("link remembers which draft produced a list", async () => {
  const root = await temp(), s = new DraftStore(root);
  expect(await s.draftFor("L1")).toBeNull();
  await s.link("L1", "d-00000001"); await s.link("L2", "d-00000002");
  expect(await s.draftFor("L1")).toBe("d-00000001");
  expect(await s.draftFor("L2")).toBe("d-00000002");
  await rm(root, { recursive: true });
});
