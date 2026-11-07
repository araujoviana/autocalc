import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../../src/cli.ts";
import {
  build,
  coverage,
  diff,
  dump,
  load,
  loadSchema,
  loadService,
  runSchemaCommand,
  SCHEMA_DIR,
  ServiceSchema,
  staleNotes,
} from "../../src/core/schema-model.ts";
import { RECIPES } from "../../src/core/services/forms.ts";
import { VERIFIED } from "../../src/core/services/publication.ts";

const FILES = readdirSync(SCHEMA_DIR).filter(f => f.endsWith(".yaml")).sort();
const IDS = FILES.map(f => f.replace(/\.yaml$/, ""));
const RAW = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/schema/ecs_controls.json", import.meta.url)), "utf8"),
) as Array<Record<string, any>>;

test("every verified service has a schema", () => {
  const missing = [...VERIFIED].filter(s => !IDS.includes(s)).sort();
  expect(missing).toEqual([]);
});

test.each(IDS)("schema file is well-formed, canonical, and order chain has no cycle and one root (%s)", async id => {
  const path = join(SCHEMA_DIR, `${id}.yaml`);
  const text = readFileSync(path, "utf8");
  const schema = load(text);
  expect(schema.service).toBe(id);
  expect(schema.frontend).toBeTruthy();
  const ids = schema.controls.map(c => c.id);
  expect(ids.length).toBe(new Set(ids).size);
  const known = new Set(ids);
  for (const c of schema.controls) {
    expect(c.after.every(a => known.has(a))).toBe(true);
    expect(c.after.includes(c.id)).toBe(false);
    for (const r of c.ranges) {
      if (r.min != null && r.max != null) expect(r.min <= r.max).toBe(true);
      expect(r.step).toBeGreaterThan(0);
    }
  }
  expect(dump(schema)).toBe(text);
  const roots = schema.controls.filter(c => c.after.length === 0 && c.modes.length === 0);
  expect(roots).toHaveLength(1);
  const byId = new Map(schema.controls.map(c => [c.id, c]));
  for (const c of schema.controls) {
    const seen = new Set<string>();
    let cur = c;
    while (cur.after.length > 0) {
      expect(seen.has(cur.id)).toBe(false);
      seen.add(cur.id);
      cur = byId.get(cur.after[0]!)!;
    }
  }
});

test("all schemas share one frontend version", async () => {
  const versions = new Set<string | number | null | undefined>();
  for (const id of IDS) {
    const schema = await loadService(id);
    versions.add(schema!.frontend);
  }
  expect(versions.size).toBe(1);
});

test("every committed service schema leaves no control unaccounted for", async () => {
  for (const svc of IDS) {
    const schema = await loadService(svc);
    expect(schema).not.toBeNull();
    for (const c of schema!.controls) {
      expect(Boolean(c.option || c.unsupported)).toBe(true);
    }
    expect(coverage(schema!).mapped_percent).toBe(100);
  }
});

test("every recipe control is in its schema under the recipe option", async () => {
  for (const [svc, recipe] of Object.entries(RECIPES)) {
    const schema = await loadService(svc);
    expect(schema).not.toBeNull();
    const byId = new Map(schema!.controls.map(c => [c.id, c]));
    for (const [option, controlId] of Object.entries(recipe.controls)) {
      expect(byId.has(controlId)).toBe(true);
      const ctrl = byId.get(controlId)!;
      expect(ctrl.option).toBe(option);
      expect(ctrl.unsupported).toBe(false);
    }
  }
});

test("format accepts valid and rejects invalid", () => {
  const good = { service: "ecs", controls: [{ id: "a", kind: "base-select", option: "image" }] };
  expect(ServiceSchema.parse(good).controls[0]!.option).toBe("image");
  expect(() => ServiceSchema.parse({ service: "ecs", controls: [{ id: "a" }] })).toThrow();
  expect(() => ServiceSchema.parse({ service: "ecs", controls: [], surprise: 1 })).toThrow();
});

test("generation is identical twice and in form order", () => {
  const first = dump(build("ecs", RAW, "1.2.3"));
  const again = dump(build("ecs", RAW, "1.2.3", load(first)));
  expect(first).toBe(again);
  const s = build("ecs", RAW, "1.2.3");
  expect(s.controls[0]!.id).toBe("global_REGIONINFO_region");
  expect(s.controls[0]!.after).toEqual([]);
  expect(s.controls[4]!.after).toEqual([s.controls[3]!.id]);
});

test("ranges keep their condition and catalog values are marked", () => {
  const s = new Map(build("ecs", RAW, null).controls.map(c => [c.id, c]));
  const bw = s.get("calculator_eip_radio_Stepper_1")!.ranges;
  const pairs = new Set(bw.map(r => `${r.min}:${r.when}`));
  expect(pairs.has("5:^19_share")).toBe(true);
  expect(pairs.has("1:^19_s?bgp")).toBe(true);
  expect(s.get("calculator_ecs_radio_arch")!.values).toBe("catalog");
  expect(s.get("calculator_evs_stepper_main_Stepper_0")!.values).toBeNull();
  expect(s.get("calculator_evs_stepper_main_Stepper_0")!.ranges[0]!.step).toBe(10);
});

test("hand-written fields survive regeneration", () => {
  const first = build("ecs", RAW, "1");
  first.controls[3]!.option = "arch";
  first.controls[3]!.note = "x86 or arm";
  const text = dump(first);
  const second = build("ecs", RAW, "2", load(text));
  expect([second.controls[3]!.option, second.controls[3]!.note]).toEqual(["arch", "x86 or arm"]);
  expect(second.frontend).toBe("2");
});

test("coverage counts mapped, unmapped, and unsupported", () => {
  const s = build("ecs", RAW, null);
  s.controls[0]!.option = "region";
  s.controls[1]!.unsupported = true;
  const c = coverage(s);
  expect(c.mapped).toEqual(["global_REGIONINFO_region"]);
  expect(c.unsupported).toEqual([s.controls[1]!.id]);
  expect(c.mapped_percent).toBe(Math.round(100 / 18));
});

test("diff reports added, removed, changed and ignores notes", () => {
  const old = build("ecs", RAW, null);
  old.controls[2]!.note = "hand-written";
  const next = build("ecs", [...RAW.slice(1), { ...RAW[0], id: "new_control", y: 9999 }], null);
  const d = diff(old, next);
  expect(d.added).toEqual(["new_control"]);
  expect(d.removed).toEqual([RAW[0]!.id]);
  expect(diff(old, build("ecs", RAW, null, old))).toEqual({ added: [], removed: [], changed: [] });
});

test.each([
  "service: x\ncontrols: [{id: a, kind: k, after_source: guess}]",
  "service: x\ncontrols: [{id: a, kind: k, ranges: [{min: low}]}]",
  "service: x\ncontrols: [{id: a, kind: k, values: static}]",
  "service: x",
  "- not a mapping",
  "",
])("malformed schema is rejected (%s)", bad => {
  expect(() => loadSchema(bad)).toThrow();
});

test("loadService unknown returns null and paths are refused", async () => {
  expect(await loadService("nope")).toBeNull();
  await expect(loadService("../schema/files/ecs")).rejects.toThrow();
});

test("generation survives missing optional page fields", () => {
  const raw = [{ id: "a", kind: "base-select" }, { id: "b", kind: "base-stepper", y: 5, ranges: [{}] }];
  const s = build("x", raw, null);
  expect(s.controls.map(c => c.id)).toEqual(["a", "b"]);
  expect(s.controls[1]!.after).toEqual(["a"]);
  expect(load(dump(s))).toEqual(s);
});

test("generation keeps a hand-listed mode control the page does not show", () => {
  const old = ServiceSchema.parse({
    service: "x",
    controls: [{ id: "m", kind: "k", option: "o", modes: ["ondemand"] }],
  });
  const s = build("x", [{ id: "a", kind: "k" }], "1", old);
  expect(new Set(s.controls.map(c => c.id))).toEqual(new Set(["a", "m"]));
  expect(diff(old, s).removed).toEqual([]);
});

test("staleNotes name each outdated schema and stay quiet when current", async () => {
  const live = (await loadService("ecs"))!.frontend as string;
  expect(await staleNotes(live)).toEqual([]);
  expect(await staleNotes(null)).toEqual([]);
  const notes = await staleNotes("0.0.1");
  expect(notes).toHaveLength(FILES.length);
  expect(notes[0]).toContain("autocalc schema diff");
});

test("CLI coverage reports JSON and unknown service fails", async () => {
  const out1: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out1.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    expect(await main(["node", "autocalc", "schema", "coverage", "ecs"])).toBe(0);
    expect(JSON.parse(out1.join("")).mapped_percent).toBe(100);
    out1.length = 0;
    expect(await main(["node", "autocalc", "schema", "coverage", "nope"])).toBe(1);
    expect(out1.join("")).toContain("No committed schema");
  } finally {
    process.stdout.write = origWrite;
  }
});

test("CLI diff exits nonzero on drift and writes nothing", async () => {
  const path = join(SCHEMA_DIR, "ecs.yaml");
  const before = readFileSync(path, "utf8");
  const fresh = (await loadService("ecs"))!;
  fresh.controls = fresh.controls.slice(0, -1);
  const out: string[] = [];
  const code = await runSchemaCommand("diff", "ecs", {
    pullFn: async () => fresh,
    write: text => out.push(text),
  });
  expect(code).toBe(1);
  expect(JSON.parse(out.join("\n")).added).toEqual([]);
  expect(readFileSync(path, "utf8")).toBe(before);
});

test("CLI pull writes the canonical file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "autocalc-schema-"));
  try {
    const out: string[] = [];
    const code = await runSchemaCommand("pull", "demo", {
      dir,
      pullFn: async svc => build(svc, [{ id: "a", kind: "k" }], "9"),
      write: text => out.push(text),
    });
    expect(code).toBe(0);
    const saved = load(readFileSync(join(dir, "demo.yaml"), "utf8"));
    expect(saved.frontend).toBe("9");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
