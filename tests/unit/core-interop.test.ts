// Drafts and run records keep the same on-disk JSON layout across the v0.1.x -> v0.2.x cutover (D4).
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide, draftQuote } from "../../src/core/quote/draft.ts";
import { candidate, Draft, type Requirement, requirement } from "../../src/core/quote/model.ts";
import { RunRecord } from "../../src/core/quote/runs.ts";
import { DraftStore } from "../../src/core/quote/store.ts";

const fake = {
  name: "huawei",
  async candidates(req: Requirement) {
    return [
      candidate("c7n.xlarge.4", req.region, req.billing, "0.1234567", { vcpus: 4, memory_gb: 16 }, 7),
      candidate("c7n.2xlarge.4", req.region, req.billing, "50", { vcpus: 8, memory_gb: 32 }, 7),
    ];
  },
};

test("a draft and its run record match the canonical on-disk JSON schema", async () => {
  const root = await mkdtemp(join(tmpdir(), "autocalc-interop-"));
  const store = new DraftStore(root);
  const d = await draftQuote(
    fake,
    "acme",
    [
      requirement({ id: "a", service: "ecs", region: "sa-brazil-1", billing: "monthly", needs: { vcpus: 4, memory_gb: 16 } }),
      requirement({ id: "b", service: "ecs", region: "la-south-2", billing: "ondemand", spec: "c7n.2xlarge.4" }),
    ],
    store,
  );
  await decide(store, d.id, "b", "c7n.2xlarge.4", "customer approved");
  const disk = JSON.parse(await readFile(join(store.dir, `${d.id}.json`), "utf8"));
  const loaded = await store.load(d.id);
  expect(loaded.toJSON()).toEqual(disk);
  expect((await new RunRecord(root, d.id).read()).map(e => e.kind)).toEqual([
    "draft",
    "requirement",
    "step",
    "candidates",
    "decision",
    "requirement",
    "step",
    "candidates",
    "decision",
    "decision",
  ]);
  expect((await store.inspect(d.id)).state).toBe("ready");
  expect((await store.list())[0]).toMatchObject({ id: d.id, customer: "acme" });
  await rm(root, { recursive: true });
});

test("a pre-cutover v0.1.x draft and run record on disk open in TypeScript", async () => {
  const root = await mkdtemp(join(tmpdir(), "autocalc-interop-"));
  const id = "d-0badcafe";
  await mkdir(join(root, "drafts"), { recursive: true });
  await mkdir(join(root, "runs"), { recursive: true });
  await writeFile(
    join(root, "drafts", `${id}.json`),
    JSON.stringify({
      id,
      customer: "acmé ✓",
      provider: "huawei",
      requirements: [
        {
          id: "a",
          service: "ecs",
          region: "sa-brazil-1",
          billing: "monthly",
          quantity: 2,
          needs: { vcpus: 4, memory_gb: 16 },
          spec: null,
          group: "ec2_vm",
          options: { image: "Ubuntu" },
        },
        {
          id: "b",
          service: "ecs",
          region: "la-south-2",
          billing: "ondemand",
          quantity: 1,
          needs: {},
          spec: "c7n.large.2",
          group: null,
          options: {},
        },
      ],
      decisions: [
        {
          requirement_id: "a",
          spec: "c7n.xlarge.4",
          decided_by: "auto",
          justification: "covers 4 vCPU/16 GB; exact match",
        },
      ],
      created: "2026-10-16T00:00:00+00:00",
    }),
    "utf8",
  );
  await writeFile(join(root, "drafts", "published.json"), JSON.stringify({ LIST1: id }), "utf8");
  await writeFile(
    join(root, "runs", `${id}.jsonl`),
    `${JSON.stringify({
      at: "2026-10-16T00:00:00+00:00",
      kind: "candidates",
      requirement_id: "a",
      total: 1,
      candidates: [{ spec: "c7n.xlarge.4", price: "0.1234567" }],
    })}\n`,
    "utf8",
  );

  const store = new DraftStore(root);
  const d = await store.load(id);
  expect(d).toBeInstanceOf(Draft);
  expect(d.customer).toBe("acmé ✓");
  expect(d.requirements[0]).toMatchObject({
    quantity: 2,
    needs: { vcpus: 4, memory_gb: 16 },
    group: "ec2_vm",
    options: { image: "Ubuntu" },
    spec: null,
  });
  expect(d.requirements[1]!.spec).toBe("c7n.large.2");
  expect(d.pending()).toEqual(["b"]);
  expect(await store.draftFor("LIST1")).toBe(id);
  expect((await store.list())[0]).toMatchObject({ id, state: "draft" });
  expect((await new RunRecord(root, id).read())[0]).toMatchObject({ kind: "candidates", requirement_id: "a" });
  const d2 = await decide(store, id, "b", "c7n.large.2", "x").catch(e => e);
  expect(d2.message).toContain("not among the candidates");
  await rm(root, { recursive: true });
});
