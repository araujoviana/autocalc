import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registry } from "../../src/core/registry.ts";
import { candidate } from "../../src/core/quote/model.ts";
import { DraftStore } from "../../src/core/quote/store.ts";
import type { ActionContext } from "../../src/core/types.ts";

const provider = { name: "fake", async candidates(req: { region: string; billing: string }) {
  return [candidate("c7n.large.2", req.region, req.billing, "10", { vcpus: 2, memory_gb: 4 }), candidate("c7n.xlarge.2", req.region, req.billing, "20", { vcpus: 4, memory_gb: 8 })];
} };
async function ctx(): Promise<ActionContext> {
  return { provider, drafts: new DraftStore(await mkdtemp(join(tmpdir(), "wf-"))), catalog: { regions: async () => ({ "sa-brazil-1": "Brazil" }) } } as unknown as ActionContext;
}
const req = (o = {}) => ({ id: "r1", service: "ecs", region: "sa-brazil-1", billing: "monthly", needs: { vcpus: 3 }, ...o });
const run = (c: ActionContext, name: keyof typeof registry, input: unknown) => registry[name].invoke(c, input) as Promise<any>;

test("draft, revise, inspect and list round trip", async () => {
  const c = await ctx();
  const d = await run(c, "draft_quote", { customer: "acme", requirements: [req()] });
  expect(d.pending).toEqual(["r1"]);
  expect(d.requirements[0].candidates.map((x: any) => x.spec).sort()).toEqual(["c7n.large.2", "c7n.xlarge.2"]);
  expect((await run(c, "revise_quote", { draft_id: d.draft_id, decisions: [{ requirement_id: "r1", spec: "c7n.xlarge.2", justification: "fits" }] })).pending).toEqual([]);
  expect((await run(c, "inspect_draft", { draft_id: d.draft_id })).state).toBe("ready");
  expect((await run(c, "list_drafts", {}))[0].id).toBe(d.draft_id);
});

test("an exact need is decided automatically", async () => {
  const d = await run(await ctx(), "draft_quote", { customer: "acme", requirements: [req({ needs: { vcpus: 2, memory_gb: 4 } })] });
  expect(d.pending).toEqual([]);
  expect(d.requirements[0].decision.by).toBe("auto");
});

test("bad input fails validation and recover refuses without confirmation", async () => {
  const c = await ctx();
  await expect(run(c, "draft_quote", { customer: "acme", requirements: [] })).rejects.toThrow();
  const d = await run(c, "draft_quote", { customer: "acme", requirements: [req()] });
  await expect(run(c, "recover_draft", { draft_id: d.draft_id, confirmed_no_remote_list: false, justification: "x" })).rejects.toThrow(/confirm/);
});
