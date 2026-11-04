/** The schema file format and generator (mirrors `src/autocalc/schema/model.py` and `generate.py`). */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { PAGE } from "./endpoints.ts";
import { SCHEMA_DIR } from "./schema-files.ts";
import * as ui from "./ui.ts";
export { SCHEMA_DIR };

const Range = z.strictObject({
  min: z.number().nullish().default(null), max: z.number().nullish().default(null), step: z.number().default(1), default: z.number().nullish().default(null), unit: z.string().nullish().default(null),
  when: z.string().nullish().default(null), // regex on the selected resource spec code; absent = always
});
const Control = z.strictObject({
  id: z.string(), kind: z.string(), title: z.string().nullish().default(null), value_type: z.string().nullish().default(null), option_key: z.string().nullish().default(null),
  default: z.union([z.string(), z.number()]).nullish().default(null), values: z.literal("catalog").nullish().default(null), ranges: z.array(Range).default([]),
  after: z.array(z.string()).default([]), after_source: z.enum(["order", "observed"]).default("order"),
  option: z.string().nullish().default(null), unsupported: z.boolean().default(false), note: z.string().nullish().default(null), modes: z.array(z.string()).default([]),
});
export const ServiceSchema = z.strictObject({ service: z.string(), frontend: z.union([z.string(), z.number()]).nullish().default(null), controls: z.array(Control) });
export type ServiceSchema = z.output<typeof ServiceSchema>;
export type SchemaControl = ServiceSchema["controls"][number];

export function loadSchema(text: string): ServiceSchema {
  const parsed = Bun.YAML.parse(text);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.frontend === "number") obj.frontend = String(obj.frontend);
  }
  return ServiceSchema.parse(parsed);
}
export const load = loadSchema;

/** The committed schema of a service, or null when none exists. A malformed file throws. */
export async function loadService(service: string, dir = SCHEMA_DIR): Promise<ServiceSchema | null> {
  if (!/^[a-z0-9]+$/i.test(service)) throw new Error(`Not a service id: ${service}`);
  let text: string;
  try { text = await readFile(join(dir, `${service}.yaml`), "utf8"); } catch { return null; }
  return loadSchema(text);
}

/** Controls in form order (top, then left); hand-written fields carried over by control id. */
export function build(
  service: string,
  raw: ReadonlyArray<Record<string, any>>,
  frontend: string | null | undefined,
  existing?: ServiceSchema | null,
): ServiceSchema {
  const kept = new Map((existing?.controls ?? []).map(c => [c.id, c]));
  const seen = new Map<string, Record<string, any>>();
  const sorted = [...raw].sort((a, b) => ((a.y ?? 0) - (b.y ?? 0)) || ((a.x ?? 0) - (b.x ?? 0)));
  for (const r of sorted) {
    if (!seen.has(String(r.id))) seen.set(String(r.id), r);
  }
  const controls: SchemaControl[] = [];
  for (const r of seen.values()) {
    const old = kept.get(String(r.id));
    controls.push({
      id: String(r.id),
      kind: String(r.kind),
      title: r.title ?? null,
      value_type: r.value_type ?? null,
      option_key: r.option_key ?? null,
      default: r.default || null,
      values: (Array.isArray(r.options) ? r.options.length > 0 : Boolean(r.options)) ? "catalog" : null,
      ranges: (r.ranges ?? []).map((x: Record<string, any>) => ({
        min: x.min ?? null,
        max: x.max ?? null,
        step: x.step ?? 1,
        default: x.default ?? null,
        unit: x.unit ?? null,
        when: x.when ?? null,
      })),
      after: controls.length ? [controls[controls.length - 1]!.id] : [],
      after_source: "order",
      option: old?.option ?? null,
      unsupported: old?.unsupported ?? false,
      note: old?.note ?? null,
      modes: old?.modes ? [...old.modes] : [],
    });
  }
  for (const c of kept.values()) {
    if (c.modes.length && !seen.has(c.id)) controls.push(c);
  }
  return ServiceSchema.parse({ service, frontend: frontend ?? null, controls });
}

const yamlStr = (s: string): string => {
  if (
    s === "" ||
    /^\s+$/.test(s) ||
    /^\d[\d_]*$/.test(s) ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
    s.includes(": ") ||
    s.includes(" #")
  ) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return s;
};
const yamlFloat = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));

/** Serialize a ServiceSchema in canonical PyYAML format (sort_keys=False, exclude_defaults=True). */
export function dump(schema: ServiceSchema): string {
  const lines: string[] = [`service: ${yamlStr(schema.service)}`];
  if (schema.frontend != null) lines.push(`frontend: ${yamlStr(String(schema.frontend))}`);
  if (!schema.controls.length) {
    lines.push("controls: []");
    return `${lines.join("\n")}\n`;
  }
  lines.push("controls:");
  for (const c of schema.controls) {
    lines.push(`- id: ${yamlStr(c.id)}`);
    lines.push(`  kind: ${yamlStr(c.kind)}`);
    if (c.title != null) lines.push(`  title: ${yamlStr(c.title)}`);
    if (c.value_type != null) lines.push(`  value_type: ${yamlStr(c.value_type)}`);
    if (c.option_key != null) lines.push(`  option_key: ${yamlStr(c.option_key)}`);
    if (c.default != null) {
      lines.push(`  default: ${typeof c.default === "number" ? yamlFloat(c.default) : yamlStr(c.default)}`);
    }
    if (c.values != null) lines.push(`  values: ${yamlStr(c.values)}`);
    if (c.ranges && c.ranges.length > 0) {
      lines.push("  ranges:");
      for (const r of c.ranges) {
        const entries: [string, string][] = [];
        if (r.min != null) entries.push(["min", yamlFloat(r.min)]);
        if (r.max != null) entries.push(["max", yamlFloat(r.max)]);
        if (r.step != null && r.step !== 1) entries.push(["step", yamlFloat(r.step)]);
        if (r.default != null) entries.push(["default", yamlFloat(r.default)]);
        if (r.unit != null) entries.push(["unit", yamlStr(r.unit)]);
        if (r.when != null) entries.push(["when", yamlStr(r.when)]);
        if (!entries.length) {
          lines.push("  - {}");
        } else {
          entries.forEach(([k, v], i) => {
            lines.push(`${i === 0 ? "  - " : "    "}${k}: ${v}`);
          });
        }
      }
    }
    if (c.after && c.after.length > 0) {
      lines.push("  after:");
      for (const a of c.after) lines.push(`  - ${yamlStr(a)}`);
    }
    if (c.after_source && c.after_source !== "order") {
      lines.push(`  after_source: ${yamlStr(c.after_source)}`);
    }
    if (c.option != null) lines.push(`  option: ${yamlStr(c.option)}`);
    if (c.unsupported === true) lines.push("  unsupported: true");
    if (c.note != null) lines.push(`  note: ${yamlStr(c.note)}`);
    if (c.modes && c.modes.length > 0) {
      lines.push("  modes:");
      for (const m of c.modes) lines.push(`  - ${yamlStr(m)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Mapped = has an option name; unsupported = deliberately not mapped; the rest is unmapped. */
export function coverage(schema: ServiceSchema) {
  const mapped = schema.controls.filter(c => c.option && !c.unsupported).map(c => c.id);
  const unsupported = schema.controls.filter(c => c.unsupported).map(c => c.id);
  const unmapped = schema.controls.filter(c => !c.option && !c.unsupported).map(c => c.id);
  const total = mapped.length + unmapped.length;
  return {
    service: schema.service,
    mapped,
    unmapped,
    unsupported,
    mapped_percent: total ? Math.round((100 * mapped.length) / total) : 100,
  };
}

const genControl = (c: SchemaControl) =>
  JSON.stringify({
    id: c.id,
    kind: c.kind,
    title: c.title ?? null,
    value_type: c.value_type ?? null,
    option_key: c.option_key ?? null,
    default: c.default ?? null,
    values: c.values ?? null,
    ranges: (c.ranges ?? []).map(r => ({
      min: r.min ?? null,
      max: r.max ?? null,
      step: r.step ?? 1,
      default: r.default ?? null,
      unit: r.unit ?? null,
      when: r.when ?? null,
    })),
    after: c.after ?? [],
    after_source: c.after_source ?? "order",
  });

/** Added, removed and changed controls; hand-written fields are ignored. Writes nothing. */
export function diff(old: ServiceSchema | null | undefined, next: ServiceSchema) {
  const before = new Map((old?.controls ?? []).filter(c => !c.modes?.length).map(c => [c.id, genControl(c)]));
  const after = new Map(next.controls.filter(c => !c.modes?.length).map(c => [c.id, genControl(c)]));
  const added = [...after.keys()].filter(k => !before.has(k)).sort();
  const removed = [...before.keys()].filter(k => !after.has(k)).sort();
  const changed = [...after.keys()].filter(k => before.has(k) && before.get(k) !== after.get(k)).sort();
  return { added, removed, changed };
}

/** One line per committed schema generated on another frontend version than `live`. */
export async function staleNotes(live: string | null | undefined, dir = SCHEMA_DIR): Promise<string[]> {
  if (!live) return [];
  const files = (await readdir(dir)).filter(f => f.endsWith(".yaml")).sort();
  const notes: string[] = [];
  for (const f of files) {
    const s = loadSchema(await readFile(join(dir, f), "utf8"));
    if (String(s.frontend ?? "") !== live) {
      notes.push(`schema ${s.service} was generated on frontend ${s.frontend}, the live one is ${live}  -> autocalc schema diff ${s.service}`);
    }
  }
  return notes;
}

export async function liveFrontendVersion(): Promise<string | null> {
  try {
    const text = await (await fetch(PAGE, { signal: AbortSignal.timeout(20000) })).text();
    return /CBC-PortalCalculator\/([0-9.]+)/.exec(text)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Read the live page (anonymous, saves nothing) and merge it over the committed schema. */
export async function pull(service: string, options: { dir?: string; headed?: boolean } = {}): Promise<ServiceSchema> {
  const { BrowserManager } = await import("./browser.ts");
  const { pageControls } = await import("./page/controls.ts");
  const manager = new BrowserManager({ headed: options.headed ?? process.env.AUTOCALC_PAGE_HEADED === "1" });
  try {
    const [raw, frontend, existing] = await Promise.all([
      pageControls(manager, service),
      liveFrontendVersion(),
      loadService(service, options.dir ?? SCHEMA_DIR),
    ]);
    return build(service, raw, frontend, existing);
  } finally {
    await manager.close();
  }
}

export async function runSchemaCommand(
  action: string,
  service: string,
  options: { dir?: string; pullFn?: (service: string) => Promise<ServiceSchema>; write?: (text: string) => void; headed?: boolean; asJson?: boolean; stream?: ui.StreamLike } = {},
): Promise<number> {
  const dir = options.dir ?? SCHEMA_DIR;
  const out = options.write ?? (() => {});
  const human = ui.fancy(options.stream) && !options.asJson;
  const pullFn = options.pullFn ?? (svc => pull(svc, { dir, ...(options.headed === undefined ? {} : { headed: options.headed }) }));
  const committed = /^[a-z0-9]+$/i.test(service) ? await loadService(service, dir) : null;
  if (action !== "pull" && committed === null) {
    const msg = `No committed schema for ${service}; run \`autocalc schema pull ${service}\`.`;
    out(human ? ui.status("fail", msg, options.stream) : msg);
    return 1;
  }
  if (action === "coverage") {
    const c = coverage(committed!);
    if (!human) {
      out(JSON.stringify(c, null, 2));
    } else {
      const lines = [
        ...c.mapped.map(i => ui.status("ok", i, options.stream)),
        ...c.unmapped.map(i => ui.status("warn", i, options.stream)),
        ...c.unsupported.map(i => ui.paint(`- ${i} (unsupported)`, "dim", options.stream)),
        ui.paint(`Coverage ${c.mapped.length}/${c.mapped.length + c.unmapped.length} controls have an option (${c.mapped_percent}%); ${c.unsupported.length} set aside as unsupported and not counted. Not a test of values or flavors.`, "bold", options.stream),
      ];
      out(lines.join("\n"));
    }
    return 0;
  }
  if (action === "diff") {
    const d = diff(committed, await pullFn(service));
    const drift = Boolean(d.added.length || d.removed.length || d.changed.length);
    if (!human) {
      out(JSON.stringify(d, null, 2));
    } else {
      const lines: string[] = [];
      for (const [key, kind] of [["added", "warn"], ["removed", "fail"], ["changed", "warn"]] as const) {
        for (const i of d[key]) lines.push(ui.status(kind, `${key}: ${i}`, options.stream));
      }
      lines.push(ui.status(drift ? "warn" : "ok", `${service}: ` + (drift
        ? `${d.added.length} added, ${d.removed.length} removed, ${d.changed.length} changed  -> autocalc schema pull ${service}`
        : "no drift from the live page"), options.stream));
      out(lines.join("\n"));
    }
    return drift ? 1 : 0;
  }
  if (action === "pull") {
    const schema = await pullFn(service);
    await writeFile(join(dir, `${service}.yaml`), dump(schema), "utf8");
    const msg = `Wrote schema for ${service}.`;
    out(human ? ui.status("ok", msg, options.stream) : msg);
    return 0;
  }
  throw new Error(`Unknown schema action: ${action}`);
}
