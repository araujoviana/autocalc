import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { loadSchema, loadService, SCHEMA_DIR } from "../../src/core/schema-model.ts";
import { RECIPES } from "../../src/core/services/forms.ts";
import { VERIFIED } from "../../src/core/services/publication.ts";

const FILES = readdirSync(SCHEMA_DIR).filter(f => f.endsWith(".yaml")).sort();
const IDS = FILES.map(f => f.replace(/\.yaml$/, ""));

test("every verified service has a schema", () => {
  const missing = [...VERIFIED].filter(s => !IDS.includes(s)).sort();
  expect(missing).toEqual([]);
});

test.each(IDS)("schema file is well-formed and order chain has no cycle and one root (%s)", async id => {
  const schema = await loadService(id);
  expect(schema).not.toBeNull();
  expect(schema!.service).toBe(id);
  expect(schema!.frontend).toBeTruthy();
  const ids = schema!.controls.map(c => c.id);
  expect(ids.length).toBe(new Set(ids).size);
  const known = new Set(ids);
  for (const c of schema!.controls) {
    expect(c.after.every(a => known.has(a))).toBe(true);
    expect(c.after.includes(c.id)).toBe(false);
    for (const r of c.ranges) {
      if (r.min != null && r.max != null) expect(r.min <= r.max).toBe(true);
      expect(r.step).toBeGreaterThan(0);
    }
  }
  const roots = schema!.controls.filter(c => c.after.length === 0 && c.modes.length === 0);
  expect(roots).toHaveLength(1);
  const byId = new Map(schema!.controls.map(c => [c.id, c]));
  for (const c of schema!.controls) {
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

test("recipe services leave no control unaccounted for", async () => {
  for (const svc of Object.keys(RECIPES)) {
    const schema = await loadService(svc);
    expect(schema).not.toBeNull();
    for (const c of schema!.controls) {
      expect(Boolean(c.option || c.unsupported)).toBe(true);
    }
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
