// Drafts and run records are shared on disk between the Python and TypeScript tools (D4).
// These tests need the repo's Python environment; they are skipped where it is not installed.
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { decide, draftQuote } from "../../src/core/quote/draft.ts";
import { candidate, requirement, type Requirement, Draft } from "../../src/core/quote/model.ts";
import { RunRecord } from "../../src/core/quote/runs.ts";
import { DraftStore } from "../../src/core/quote/store.ts";

const repo = resolve(import.meta.dir, "../../../.."), python = join(repo, ".venv/bin/python");
const run = (code: string, ...args: string[]) => {
  const proc = Bun.spawnSync([python, "-I", "-c", code, ...args], { cwd: repo, env: { ...process.env, PYTHONPATH: join(repo, "src") } });
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
  return proc.stdout.toString();
};
const maybe = existsSync(python) ? test : test.skip;

const fake = { name: "huawei", async candidates(req: Requirement) {
  return [candidate("c7n.xlarge.4", req.region, req.billing, "0.1234567", { vcpus: 4, memory_gb: 16 }, 7), candidate("c7n.2xlarge.4", req.region, req.billing, "50", { vcpus: 8, memory_gb: 32 }, 7)];
} };

maybe("a draft and its run record written by TypeScript open in Python", async () => {
  const root = await mkdtemp(join(tmpdir(), "autocalc-interop-")), store = new DraftStore(root);
  const d = await draftQuote(fake, "acme", [requirement({ id: "a", service: "ecs", region: "sa-brazil-1", billing: "monthly", needs: { vcpus: 4, memory_gb: 16 } }),
    requirement({ id: "b", service: "ecs", region: "la-south-2", billing: "ondemand", spec: "c7n.2xlarge.4" })], store);
  await decide(store, d.id, "b", "c7n.2xlarge.4", "customer approved");
  const out = JSON.parse(run(`import json,sys
from pathlib import Path
from autocalc.core import DraftStore, RunRecord
s = DraftStore(sys.argv[1]); d = s.load(sys.argv[2])
print(json.dumps({"draft": d.to_dict(), "kinds": [e["kind"] for e in RunRecord(sys.argv[1], sys.argv[2]).read()], "list": s.list(), "state": s.inspect(sys.argv[2])["state"]}))`, root, d.id));
  expect(out.draft).toEqual(JSON.parse(await readFile(join(store.dir, `${d.id}.json`), "utf8")));
  expect(out.kinds).toEqual((await new RunRecord(root, d.id).read()).map(e => e.kind));
  expect(out.state).toBe("ready");
  expect(out.list[0]).toMatchObject({ id: d.id, customer: "acme" });
  await rm(root, { recursive: true });
});

maybe("a draft and its run record written by Python open in TypeScript", async () => {
  const root = await mkdtemp(join(tmpdir(), "autocalc-interop-")), id = "d-0badcafe";
  run(`import sys
from decimal import Decimal
from autocalc.core import Decision, Draft, DraftStore, Requirement, RunRecord
s = DraftStore(sys.argv[1])
d = Draft(sys.argv[2], "acmé ✓", "huawei", [Requirement("a", "ecs", "sa-brazil-1", "monthly", 2, {"vcpus": 4, "memory_gb": 16}, group="ec2_vm", options={"image": "Ubuntu"}),
    Requirement("b", "ecs", "la-south-2", "ondemand", spec="c7n.large.2")])
d.add_decision(Decision("a", "c7n.xlarge.4", "auto", "covers 4 vCPU/16 GB; exact match"))
s.save(d); s.link("LIST1", d.id)
RunRecord(sys.argv[1], d.id).append("candidates", requirement_id="a", total=1, candidates=[{"spec": "c7n.xlarge.4", "price": str(Decimal("0.1234567"))}])`, root, id);
  const store = new DraftStore(root), d = await store.load(id);
  expect(d).toBeInstanceOf(Draft);
  expect(d.customer).toBe("acmé ✓");
  expect(d.requirements[0]).toMatchObject({ quantity: 2, needs: { vcpus: 4, memory_gb: 16 }, group: "ec2_vm", options: { image: "Ubuntu" }, spec: null });
  expect(d.requirements[1]!.spec).toBe("c7n.large.2");
  expect(d.pending()).toEqual(["b"]);
  expect(await store.draftFor("LIST1")).toBe(id);
  expect((await store.list())[0]).toMatchObject({ id, state: "draft" });
  expect((await new RunRecord(root, id).read())[0]).toMatchObject({ kind: "candidates", requirement_id: "a" });
  // and TypeScript can continue the draft Python started
  const d2 = await decide(store, id, "b", "c7n.large.2", "x").catch(e => e);
  expect(d2.message).toContain("not among the candidates"); // Python recorded candidates only for "a"
  await rm(root, { recursive: true });
});
