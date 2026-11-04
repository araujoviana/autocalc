import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CalculatorError } from "../../src/core/errors.ts";
import * as quoteFile from "../../src/core/quote-file.ts";
import { candidate } from "../../src/core/quote/model.ts";
import { DraftStore } from "../../src/core/quote/store.ts";
import type { ActionContext } from "../../src/core/types.ts";

type Dict = Record<string, any>;
const SAMPLE = join(import.meta.dir, "../fixtures/quotes/sample.yaml");
const prices: Dict = {};
const reset = () => Object.assign(prices, { "c7n.large.2": "10", "c7n.xlarge.2": "20" });
const provider = { name: "fake", async candidates(r: { region: string; billing: string }) {
  return [["c7n.large.2", 2], ["c7n.xlarge.2", 4]].map(([spec, v]) => candidate(String(spec), r.region, r.billing, prices[String(spec)], { vcpus: Number(v), memory_gb: Number(v) * 2 }));
} };

async function env() {
  reset();
  const dir = await mkdtemp(join(tmpdir(), "quote-file-"));
  const published: Dict[] = [];
  const images: Dict[] = [{ __platform: "AlmaLinux", name: "AlmaLinux 9.0 64bit", type: ["c7n"] }];
  const saved: Dict[] = [];
  const ctx = { provider: { ...provider }, drafts: new DraftStore(join(dir, "drafts")), catalog: { regions: async () => ({ "sa-brazil-1": "Brazil" }), productInfo: async () => ({ product: { "ec2_vm.image.special": images } }) },
    publish: { form: async () => ({}), encode: async () => ({ selectedProduct: { productAllInfos: [] } }), liveVersion: async () => "11.4.201",
      publish: async (name: string) => { published.push({ name }); return { id: "L1", url: "u", checks: [] }; } },
    lists: { lists: async () => saved } } as unknown as ActionContext;
  const file = join(dir, "q.yaml");
  await writeFile(file, await readFile(SAMPLE, "utf8"));
  const q = await quoteFile.load(file);
  return { dir, ctx, q, published, images, saved, lock: join(dir, "q.lock.json") };
}
const sized = (q: quoteFile.Quote, options: Dict = {}) => Object.assign(q.cards[0]!, { needs: { vcpus: 4, memory_gb: 8 }, options });
const rejects = async (promise: Promise<unknown>) => { try { await promise; } catch (error) { return error as CalculatorError; } throw new Error("expected a rejection"); };

test("defaults apply to every card", async () => {
  const { q } = await env();
  expect(q.cards[0]).toMatchObject({ region: "sa-brazil-1", billing: "monthly" });
});

test("an unknown option names the card, the field and the legal options", async () => {
  const { q } = await env();
  q.cards[0]!.options = { sytem_disk_gb: 100 };
  const [error, ...rest] = await quoteFile.validate(q);
  expect(rest).toEqual([]);
  expect([error!.card, error!.field]).toEqual(["web", "sytem_disk_gb"]);
  expect(error!.allowed).toContain("system_disk");
  expect(error!.hint).toContain("schema");
});

test("an out-of-range number names the range", async () => {
  const dir = await mkdtemp(join(tmpdir(), "schema-"));
  await writeFile(join(dir, "ecs.yaml"), "service: ecs\ncontrols:\n- id: c\n  kind: base-stepper\n  option: bandwidth_mbit\n  ranges:\n  - {min: 1, max: 2000}\n");
  const { q } = await env();
  q.cards[0]!.options = { bandwidth_mbit: 5000 };
  const [error] = await quoteFile.validate(q, dir);
  expect(error!.range.max).toBe(2000);
  expect(error!.error).toContain("outside the range 1..2000");
});

test("the sample is valid; a missing size is reported", async () => {
  const { q } = await env();
  expect(await quoteFile.validate(q)).toEqual([]);
  delete q.cards[0]!.needs;
  expect((await quoteFile.validate(q))[0]!.field).toBe("spec");
});

test("plan resolves, prices exactly and writes a lock", async () => {
  const { ctx, q, lock } = await env();
  sized(q);
  const out = await quoteFile.plan(ctx, q);
  expect(out.cards[0]).toMatchObject({ spec: "c7n.xlarge.2", price: "20" });
  expect(await readFile(lock, "utf8")).toContain('"c7n.xlarge.2"');
});

test("an ambiguous card shows candidates and apply refuses", async () => {
  const { ctx, q, published } = await env();
  Object.assign(q.cards[0]!, { needs: { vcpus: 1 }, options: {} });
  const out = await quoteFile.plan(ctx, q);
  expect(out.pending.length).toBeGreaterThan(0);
  expect(out.cards[0]!.candidates.length).toBeGreaterThan(0);
  expect((await rejects(quoteFile.apply(ctx, q))).message).toContain("unresolved");
  expect(published).toEqual([]);
});

test("a moved price is reported, blocks apply and keeps the pin", async () => {
  const { ctx, q, published, lock } = await env();
  sized(q);
  await quoteFile.plan(ctx, q);
  const pinned = await readFile(lock, "utf8");
  prices["c7n.xlarge.2"] = "25";
  expect((await quoteFile.plan(ctx, q)).cards[0]!.lock_drift).toEqual({ locked_price: "20", price: "25" });
  expect((await rejects(quoteFile.apply(ctx, q))).message).toContain("changed price");
  expect(await readFile(lock, "utf8")).toBe(pinned);
  expect(published).toEqual([]);
});

test("apply publishes through publish_quote under the file's name", async () => {
  const { ctx, q, published } = await env();
  sized(q, { bandwidth_mbit: 10 });
  const out = await quoteFile.apply(ctx, q) as Dict;
  expect(published[0]!.name).toBe("[autocalc] example");
  expect(out).toMatchObject({ id: "L1", url: "u" });
});

test("an option error lists the legal values and points to the schema", async () => {
  const { ctx, q } = await env();
  q.cards[0]!.options = { sytem_disk_gb: 100 };
  const error = await rejects(quoteFile.plan(ctx, q));
  expect(error.hint).toContain("system_disk");
  expect(error.hint).toContain("autocalc://schema");
});

test.each([
  [{ id: "a" }], [{ id: "a", service: "" }], [{ id: "a", service: "../ecs", region: "r", billing: "monthly" }],
  [{ id: "a", service: null, region: "r", billing: "monthly" }], [{ id: "a", service: "ecs", options: [1] }],
  [{ id: "a", service: "ecs", region: "r", billing: "weekly", options: { bandwidth_mbit: "ten" } }],
  [{ id: "a", service: "ecs", region: "r", billing: "monthly", options: { bandwidth_mbit: true } }],
  [{ id: "a", service: "ecs", region: "r", billing: "monthly", needs: { vcpus: 1 }, surprise: 1 }],
])("validate reports garbage instead of throwing: %j", async card => {
  const errors = await quoteFile.validate({ customer: "c", cards: [card as Dict], settlement: "total" });
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.every(error => error.field && error.error)).toBe(true);
});

test.each(["", "[]", "cards: []", "customer: x\ncards: [1]", "customer: x\ncards: {a: 1}", "customer: x\ndefaults: {color: red}\ncards: [{id: a}]", ": : :"])(
  "parse rejects malformed file %j with a validation error", text => {
    try { quoteFile.parse(text); throw new Error("accepted"); } catch (error) { expect(error).toMatchObject({ code: "VALIDATION" }); }
  });

test("duplicate card ids are refused before any work", async () => {
  const { ctx, q } = await env();
  q.cards.push({ ...q.cards[0]! });
  expect((await rejects(quoteFile.plan(ctx, q))).message).toContain("unique");
});

test("a corrupt lock file is not silently replaced", async () => {
  const { ctx, q, lock } = await env();
  sized(q);
  await writeFile(lock, "{not json");
  await rejects(quoteFile.plan(ctx, q));
  expect(await readFile(lock, "utf8")).toBe("{not json");
});

test("plan makes no website call", async () => {
  const { ctx, q } = await env();
  (ctx as Dict).lists = new Proxy({}, { get: () => { throw new Error("website touched"); } });
  sized(q);
  await quoteFile.plan(ctx, q);
});

test("a changed size request is not silently resolved to the old pin", async () => {
  const { ctx, q, lock } = await env();
  sized(q);
  await quoteFile.plan(ctx, q);
  const before = await readFile(lock, "utf8");
  q.cards[0]!.needs = { vcpus: 1 };
  const out = await quoteFile.plan(ctx, q);
  expect(out.pending.length).toBeGreaterThan(0);
  expect(out.cards[0]!.candidates.length).toBeGreaterThan(0);
  expect(out.cards[0]).not.toHaveProperty("spec");
  expect(await readFile(lock, "utf8")).toBe(before);
});

test("the schema format rejects a control without a kind or an unknown key; every committed schema loads", async () => {
  const { ServiceSchema, loadService } = await import("../../src/core/schema-model.ts");
  const { readdir } = await import("node:fs/promises");
  const { SCHEMA_DIR } = await import("../../src/core/schema-files.ts");
  expect(ServiceSchema.safeParse({ service: "ecs", controls: [{ id: "a", kind: "base-select", option: "image" }] }).success).toBe(true);
  expect(ServiceSchema.safeParse({ service: "ecs", controls: [{ id: "a" }] }).success).toBe(false);
  expect(ServiceSchema.safeParse({ service: "ecs", controls: [], surprise: 1 }).success).toBe(false);
  const files = (await readdir(SCHEMA_DIR)).filter(name => name.endsWith(".yaml"));
  expect(files.length).toBeGreaterThan(40);
  for (const file of files) expect(await loadService(file.replace(/\.yaml$/, ""))).not.toBeNull();
});

test("plan flags an image request that matches several catalog images, and apply refuses before publishing", async () => {
  const { ctx, q, published, images } = await env();
  images.push({ __platform: "AlmaLinux", name: "AlmaLinux 8.4 64bit", type: ["c7n"] });
  sized(q);
  const planned = await quoteFile.plan(ctx, q) as Dict;
  expect(planned.cards[0].image_choices).toEqual(["AlmaLinux 9.0 64bit", "AlmaLinux 8.4 64bit"]);
  const error = await rejects(quoteFile.apply(ctx, q));
  expect(error).toMatchObject({ code: "VALIDATION", message: expect.stringContaining("matches several images") });
  expect(published).toEqual([]);
});

test("an exact image name is not flagged even when a family has several versions", async () => {
  const { ctx, q, images } = await env();
  images.push({ __platform: "AlmaLinux", name: "AlmaLinux 8.4 64bit", type: ["c7n"] });
  sized(q, { image: "AlmaLinux 9.0 64bit" });
  const planned = await quoteFile.plan(ctx, q) as Dict;
  expect(planned.cards[0].image_choices).toBeUndefined();
});

test("apply warns when a list of the same name exists, and still publishes", async () => {
  const { ctx, q, published, saved } = await env();
  sized(q);
  saved.push({ name: "[autocalc] example", key: "OLD1" }); // the account API calls a list's id `key`
  const out = await quoteFile.apply(ctx, q) as Dict;
  expect(published).toHaveLength(1);
  expect(out.warnings).toEqual(['A list named "[autocalc] example" already exists (id OLD1); this creates another.']);
});

test("apply adds no warning when no list has that name", async () => {
  const { ctx, q, saved } = await env();
  sized(q);
  saved.push({ name: "something else", key: "OLD2" });
  expect(((await quoteFile.apply(ctx, q)) as Dict).warnings).toBeUndefined();
});

test("plan flags a yearly price far above twelve months of the monthly price, and apply repeats it as a warning", async () => {
  const { ctx, q, published } = await env();
  Object.assign(ctx.provider, { prices: async () => ({ monthly: 10, yearly: 147 }) });
  sized(q); q.cards[0]!.billing = "yearly";
  const planned = await quoteFile.plan(ctx, q) as Dict;
  expect(planned.cards[0].price_anomaly).toContain("14.7x");
  const applied = await quoteFile.apply(ctx, q) as Dict;
  expect(published).toHaveLength(1);
  expect(applied.warnings.some((w: string) => w.includes("Catalog anomaly"))).toBe(true);
});

test("a normal yearly price, or a SKU with no known prices, raises no anomaly", async () => {
  const { ctx, q } = await env();
  sized(q); q.cards[0]!.billing = "yearly";
  Object.assign(ctx.provider, { prices: async () => ({ monthly: 10, yearly: 68 }) });
  expect(((await quoteFile.plan(ctx, q)) as Dict).cards[0].price_anomaly).toBeUndefined();
  Object.assign(ctx.provider, { prices: async () => null });
  expect(((await quoteFile.plan(ctx, q)) as Dict).cards[0].price_anomaly).toBeUndefined();
});
