import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleCard, inFormOnlyMode } from "../../src/core/cards.ts";
import { CalculatorError } from "../../src/core/errors.ts";
import { encodeWorkers, frontendWarnings, type PublishPorts } from "../../src/core/publish.ts";
import { candidate } from "../../src/core/quote/model.ts";
import { DraftStore } from "../../src/core/quote/store.ts";
import { registry } from "../../src/core/registry.ts";
import type { ActionContext } from "../../src/core/types.ts";

type Dict = Record<string, any>;
const provider = { name: "fake", async candidates(r: { region: string; billing: string }) {
  return [candidate("c7n.large.2", r.region, r.billing, "10", { vcpus: 2, memory_gb: 4 }), candidate("c7n.xlarge.2", r.region, r.billing, "20", { vcpus: 4, memory_gb: 8 })];
} };
const req = (o: Dict = {}) => ({ id: "r1", service: "ecs", region: "sa-brazil-1", billing: "monthly", needs: { vcpus: 2, memory_gb: 4 }, ...o });

/** A context whose ports record what they were given; `over` bends one seam. */
async function setup(over: Partial<PublishPorts> = {}, signedIn = true) {
  const seen = { forms: [] as Dict[], encoded: [] as string[], published: [] as Dict[][], lists: 0 };
  const ports: PublishPorts = {
    form: async input => { seen.forms.push(input); return { form: 1 }; },
    encode: async service => { seen.encoded.push(service); return { selectedProduct: { productAllInfos: [{ resourceSpecCode: "c7n.large.2" }] } }; },
    publish: async (_name, cards) => { seen.published.push(cards); return { id: "L1", url: "u", checks: [] }; },
    liveVersion: async () => "11.4.201",
    ...over,
  };
  const ctx = { provider, publish: ports, drafts: new DraftStore(await mkdtemp(join(tmpdir(), "pub-"))), catalog: { regions: async () => ({ "sa-brazil-1": "Brazil" }) },
    lists: { lists: async () => { seen.lists++; if (!signedIn) throw new CalculatorError("AUTH_EXPIRED", "Not logged in."); return []; } } } as unknown as ActionContext;
  return { ctx, seen };
}
const run = (ctx: ActionContext, name: keyof typeof registry, input: unknown) => registry[name].invoke(ctx, input) as Promise<any>;
const draft = async (ctx: ActionContext, r: Dict = req()) => (await run(ctx, "draft_quote", { customer: "acme", requirements: [r] })).draft_id as string;
const rejects = async (promise: Promise<unknown>) => { try { await promise; } catch (error) { return error as CalculatorError; } throw new Error("expected a rejection"); };

test("an undecided draft cannot publish; a decided one builds the form, encodes it on the page and titles the card", async () => {
  const { ctx, seen } = await setup();
  const id = await draft(ctx, req({ needs: { vcpus: 3 }, options: { image: "AlmaLinux" } }));
  const refusal = await rejects(run(ctx, "publish_quote", { draft_id: id, name: "n" }));
  expect(refusal.details).toMatchObject({ allowed: ["r1"], field: "requirement_id" });
  await run(ctx, "revise_quote", { draft_id: id, decisions: [{ requirement_id: "r1", spec: "c7n.xlarge.2", justification: "headroom" }] });
  const out = await run(ctx, "publish_quote", { draft_id: id, name: "n" });
  expect(seen.forms[0]).toMatchObject({ service: "ecs", flavor: "c7n.xlarge.2", image: "AlmaLinux", region: "sa-brazil-1", billing: "monthly" });
  expect(seen.forms[0]!.quantity).toBe(1);
  expect(seen.encoded).toEqual(["ecs"]);
  expect(seen.published[0]![0]!.selectedProduct._customTitle).toBe("r1"); // the requirement's name, not "custom.ecs 1"
  expect(out).toMatchObject({ draft_id: id, id: "L1", url: "u", checks: [] });
});

test("a changed frontend is reported next to the link", async () => {
  const { ctx } = await setup({ liveVersion: async () => "99.0.0" });
  const out = await run(ctx, "publish_quote", { draft_id: await draft(ctx), name: "n" });
  expect(out.warnings[0]).toContain("99.0.0");
  expect(frontendWarnings(["ecs", "ecs"], undefined)).toHaveLength(1);
  expect(frontendWarnings(["ecs"], "11.4.201")).toEqual([]);
});

test("a card the page cannot encode saves nothing", async () => {
  const { ctx, seen } = await setup({ encode: async () => { throw new CalculatorError("PAGE_ENCODE_FAILED", "no"); } });
  expect((await rejects(run(ctx, "publish_quote", { draft_id: await draft(ctx), name: "n" }))).code).toBe("PAGE_ENCODE_FAILED");
  expect(seen.published).toEqual([]);
});

test("an unsupported service fails before anything is built", async () => {
  const { ctx, seen } = await setup();
  const id = await draft(ctx, req({ service: "cbh", needs: { vcpus: 1000 } }));
  await run(ctx, "revise_quote", { draft_id: id, decisions: [{ requirement_id: "r1", spec: "c7n.large.2", justification: "test" }] });
  const error = await rejects(run(ctx, "publish_quote", { draft_id: id, name: "n" }));
  expect(error.message).toContain("cbh");
  expect(seen.forms).toEqual([]);
});

test("the login is checked before anything is encoded", async () => {
  const { ctx, seen } = await setup({}, false);
  expect((await rejects(run(ctx, "publish_quote", { draft_id: await draft(ctx), name: "n" }))).code).toBe("AUTH_EXPIRED");
  expect(seen.encoded).toEqual([]);
});

test("publishing is idempotent and freezes the decisions", async () => {
  const { ctx, seen } = await setup();
  const id = await draft(ctx), first = await run(ctx, "publish_quote", { draft_id: id, name: "n" });
  expect(await run(ctx, "publish_quote", { draft_id: id, name: "n" })).toEqual(first);
  expect(seen.published).toHaveLength(1);
  expect((await rejects(run(ctx, "revise_quote", { draft_id: id, decisions: [{ requirement_id: "r1", spec: "c7n.large.2", justification: "change" }] }))).message).toContain("cannot be revised");
});

test("an ambiguous publication is not retried", async () => {
  let calls = 0;
  const { ctx } = await setup({ publish: async () => { calls++; throw new Error("connection lost after save"); } });
  const id = await draft(ctx);
  await rejects(run(ctx, "publish_quote", { draft_id: id, name: "n" }));
  expect((await rejects(run(ctx, "publish_quote", { draft_id: id, name: "n" }))).message).toContain("unknown outcome");
  expect(calls).toBe(1);
  expect((await run(ctx, "inspect_draft", { draft_id: id })).state).toBe("unknown_outcome");
});

test("a verified result survives an index failure", async () => {
  const { ctx, seen } = await setup();
  const id = await draft(ctx);
  ctx.drafts.link = async () => { throw new Error("disk full"); };
  await rejects(run(ctx, "publish_quote", { draft_id: id, name: "n" }));
  expect((await run(ctx, "publish_quote", { draft_id: id, name: "n" })).id).toBe("L1");
  expect(seen.published).toHaveLength(1);
});

test("a builder that takes options cannot publish a card with a different spec than the decision", async () => {
  const { ctx } = await setup({ encode: async () => ({ selectedProduct: { productAllInfos: [{ resourceSpecCode: "different" }] } }) });
  const id = await draft(ctx, req({ service: "cce" }));
  expect((await rejects(run(ctx, "publish_quote", { draft_id: id, name: "n" }))).message).toContain("does not contain the selected spec");
  expect((await run(ctx, "inspect_draft", { draft_id: id })).state).toBe("ready");
});

test("options the builder does not take are refused at draft time, and again at publish for a draft saved by other means", async () => {
  const { ctx, seen } = await setup();
  expect((await rejects(run(ctx, "draft_quote", { customer: "acme", requirements: [req({ options: { sytem_disk: ["GPSSD", 40] } })] }))).message).toContain("no option 'sytem_disk'");
  expect((await rejects(run(ctx, "draft_quote", { customer: "acme", requirements: [req({ options: { flavor: "x" } })] }))).message).toContain("no option 'flavor'");
  for (const [options, text] of [[{ sytem_disk: ["GPSSD", 40] }, "Invalid ecs builder options"], [{ flavor: "x" }, "duplicate"]] as const) {
    const id = await draft(ctx);
    const saved = await ctx.drafts.load(id);
    saved.requirements[0]!.options = options;
    await ctx.drafts.save(saved);
    expect((await rejects(run(ctx, "publish_quote", { draft_id: id, name: "n" }))).message).toContain(text);
  }
  expect(seen.forms).toEqual([]);
});

test("the list name is validated and a quantity the form cannot express is refused", async () => {
  const { ctx } = await setup();
  expect((await rejects(run(ctx, "publish_quote", { draft_id: await draft(ctx), name: "x".repeat(51) }))).details).toMatchObject({ field: "name" });
  const id = await draft(ctx, req({ service: "nat", billing: "ondemand", quantity: 2 }));
  expect((await rejects(run(ctx, "publish_quote", { draft_id: id, name: "n" }))).message).toContain("cannot express quantity");
});

test("publishing without a browser says so", async () => {
  const { ctx } = await setup();
  const id = await draft(ctx);
  expect((await rejects(registry.publish_quote.invoke({ ...ctx, publish: undefined } as unknown as ActionContext, { draft_id: id, name: "n" }))).code).toBe("BROWSER_UNAVAILABLE");
});

test("the encode budget honors the override and is bounded by memory and cpus", () => {
  expect(encodeWorkers({ AUTOCALC_ENCODE_WORKERS: "5" })).toBe(5);
  for (const bad of ["0", "17", "x", "1.5"]) expect(() => encodeWorkers({ AUTOCALC_ENCODE_WORKERS: bad })).toThrow(/1 to 16/);
  expect(encodeWorkers({}, 64 * 1024 ** 3, 16)).toBe(3);
  expect(encodeWorkers({}, 1024 ** 3, 16)).toBe(1);
  expect(encodeWorkers({}, 64 * 1024 ** 3, 2)).toBe(2);
});

test("form-only mode keeps the requested page state and never rates", async () => {
  const rate = async () => { throw new Error("rated"); };
  const product = { productNum: 1, inquiryTag: "normal", productId: "p", resourceSpecCode: "s" };
  const card = await inFormOnlyMode(() => assembleCard({ service: "ecs", region: "r", billing: "monthly", periods: 1, hours: 730, quantity: 1, products: [{ ...product }], description: "d", rewrite: { a: 1 } }, rate));
  expect(card.rewriteValue).toMatchObject({ global_REGIONINFO: { region: "r" }, template_RENDER: { a: 1 }, global_QUANTITY: expect.anything() });
  await expect(assembleCard({ service: "ecs", region: "r", billing: "monthly", periods: 1, hours: 730, quantity: 1, products: [{ ...product }], description: "d", rewrite: {} }, rate)).rejects.toThrow("rated");
});

test("a real builder in form-only mode yields the same page state as the full card without rating", async () => {
  const { buildCard } = await import("../../src/core/services/index.ts");
  const planList = [{ billingMode: "MONTHLY", productId: "p" }];
  const productInfo = async () => ({ product: { ec2_vm: [{ resourceSpecCode: "c7.linux", cloudServiceType: "c", resourceType: "vm", spec: "c7", arch: "x", vmType: "v", cpu: "2", mem: "4", generation: "g", planList }], "ec2_vm.image.special": [{ id: "i", __platform: "Linux", name: "AlmaLinux", type: ["c7"] }], ebs_volume: [{ resourceSpecCode: "GPSSD", cloudServiceType: "c", resourceType: "disk", type: "ssd", planList }] } });
  const input = { service: "ecs", region: "r", billing: "monthly", quantity: 1, periods: 1, hours: 730, flavor: "c7", image: "AlmaLinux", system_disk: ["GPSSD", 40], bandwidth_type: "19_bgp", ri_time: "1_3" } as never;
  const full = await buildCard(input, { productInfo, rate: async (body: Dict) => ({ productRatingResult: body.productInfos.map(({ id }: Dict) => ({ id, amount: 1 })) }) });
  const form = await inFormOnlyMode(() => buildCard(input, { productInfo, rate: async () => { throw new Error("rated"); } }));
  expect(form.rewriteValue).toEqual(full.rewriteValue);
});

test("a verified recipe service publishes through its recipe controls", async () => {
  const { buildRecipe } = await import("../../src/core/services/forms.ts");
  const { ctx, seen } = await setup({
    form: async input => buildRecipe(String(input.service), input as never).rewriteValue,
  });
  (ctx as Dict).catalog.productInfo = async () => ({ product: { "er_er.attachment": [{ resourceSpecCode: "c7n.large.2" }] } });
  const id = await draft(ctx, req({ service: "er", billing: "ondemand", options: { downflow_gb: 250, attachments: 2 } }));
  await run(ctx, "revise_quote", { draft_id: id, decisions: [{ requirement_id: "r1", spec: "c7n.large.2", justification: "test" }] });
  const out = await run(ctx, "publish_quote", { draft_id: id, name: "n" });
  expect(seen.encoded).toEqual(["er"]);
  expect(out.id).toBe("L1");
});

test("a DES card takes its transfer type, and a DSS card its pool type, from the chosen SKU", async () => {
  const { buildRecipe } = await import("../../src/core/services/forms.ts");
  const { ctx, seen } = await setup({ form: async input => { seen.forms.push(input); return buildRecipe(String(input.service), input as never).rewriteValue; } });
  (ctx as Dict).catalog.productInfo = async (service: string) => ({ product: service === "des" ? { des_des: [{ resourceSpecCode: "c7n.large.2", transferTypeClass: "calc_12_" }] } : { "dss_dss.pool": [{ resourceSpecCode: "c7n.large.2", type: "detail_2_", dssDivision: "13.600 TB" }] } });
  const des = await draft(ctx, req({ service: "des", billing: "ondemand", options: {} }));
  await run(ctx, "revise_quote", { draft_id: des, decisions: [{ requirement_id: "r1", spec: "c7n.large.2", justification: "test" }] });
  await run(ctx, "publish_quote", { draft_id: des, name: "n" });
  expect(seen.forms.at(-1)).toMatchObject({ service: "des", transfer_type: "calc_12_" });
  const dss = await draft(ctx, req({ service: "dss", billing: "yearly", options: { capacity: "13.600 TB" } }));
  await run(ctx, "revise_quote", { draft_id: dss, decisions: [{ requirement_id: "r1", spec: "c7n.large.2", justification: "test" }] });
  await run(ctx, "publish_quote", { draft_id: dss, name: "n" });
  expect(seen.forms.at(-1)).toMatchObject({ service: "dss", type: "detail_2_", capacity: "13.600 TB" });
});

test("a Redis card gets the page controls of the chosen SKU; a spec the region does not sell is refused", async () => {
  const { buildRecipe } = await import("../../src/core/services/forms.ts");
  const { ctx, seen } = await setup({ form: async input => { seen.forms.push(input); return buildRecipe(String(input.service), input as never).rewriteValue; } });
  const item = { resourceSpecCode: "c7n.large.2", instance_type: "single", version: "5.0", edition: "basic", cpu_storage: "x86", spec: "S1", ignored: "no" };
  (ctx as Dict).catalog.productInfo = async () => ({ product: { dcs_dcs3: [item] } });
  const id = await draft(ctx, req({ service: "redis", options: {} }));
  await run(ctx, "revise_quote", { draft_id: id, decisions: [{ requirement_id: "r1", spec: "c7n.large.2", justification: "test" }] });
  await run(ctx, "publish_quote", { draft_id: id, name: "n" });
  expect(seen.forms.at(-1)).toMatchObject({ service: "redis", instance_type: "single", version: "5.0", edition: "basic", cpu_storage: "x86", spec: "S1" });
  expect(seen.forms.at(-1)).not.toHaveProperty("ignored");

  (ctx as Dict).catalog.productInfo = async () => ({ product: { dcs_dcs3: [] } });
  const id2 = await draft(ctx, req({ service: "redis", options: {} }));
  await run(ctx, "revise_quote", { draft_id: id2, decisions: [{ requirement_id: "r1", spec: "c7n.large.2", justification: "test" }] });
  expect((await rejects(run(ctx, "publish_quote", { draft_id: id2, name: "n" }))).message).toContain("not a redis SKU sold in");
});
