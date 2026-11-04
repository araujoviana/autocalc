import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunRecord } from "../../src/core/quote/runs.ts";

test("events append and earlier lines do not change", async () => {
  const root = await mkdtemp(join(tmpdir(), "autocalc-runs-")), r = new RunRecord(root, "d-1");
  await r.append("requirement", { id: "a" });
  const first = await readFile(r.path, "utf8");
  await r.append("decision", { by: "human" });
  expect((await readFile(r.path, "utf8")).startsWith(first)).toBe(true);
  const events = await r.read();
  expect(events.map(e => e.kind)).toEqual(["requirement", "decision"]);
  expect(events.every(e => e.t.endsWith("+00:00"))).toBe(true);
  await rm(root, { recursive: true });
});

test("a failing step is still timed", async () => {
  const root = await mkdtemp(join(tmpdir(), "autocalc-runs-")), r = new RunRecord(root, "d-1");
  await expect(r.step("boom", async () => { throw new Error("x"); })).rejects.toThrow("x");
  const [e] = await r.read();
  expect(e).toMatchObject({ kind: "step", name: "boom" });
  expect(e!.ms).toBeGreaterThanOrEqual(0);
  await rm(root, { recursive: true });
});

test("a missing record reads empty", async () => {
  expect(await new RunRecord("/nonexistent-autocalc", "d-none").read()).toEqual([]);
});
