import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CalculatorError } from "./errors.ts";
import { legalOptions, modesOf, VERIFIED } from "./services/publication.ts";

export const SCHEMA_DIR = process.env.AUTOCALC_SCHEMA_DIR ?? join(import.meta.dir, "..", "schema", "files");

interface Control { id: string; option?: string; unsupported?: boolean; title?: string; default?: unknown; values?: unknown; ranges?: unknown[]; note?: string }
interface Schema { service: string; frontend: string; controls: Control[] }

/** Mapped = has an option name; unsupported = deliberately not mapped; the rest is unmapped ; the percentage leaves unsupported controls out, so they are reported beside it, and it says nothing about whether a mapped control was verified live. */
export function coverage(schema: Schema) {
  const mapped = schema.controls.filter(c => c.option && !c.unsupported).length;
  const unmapped = schema.controls.filter(c => !c.option && !c.unsupported).length, total = mapped + unmapped;
  const unsupported = schema.controls.filter(c => c.unsupported).length;
  return { mapped_percent: total ? Math.round(100 * mapped / total) : 100, unmapped, unsupported };
}

let cachedIndex: string | undefined;

export async function schemaIndex(dir = SCHEMA_DIR): Promise<string> {
  if (dir === SCHEMA_DIR && cachedIndex) return cachedIndex;
  const rows = [];
  for (const file of (await readdir(dir)).filter(name => name.endsWith(".yaml")).sort()) {
    const schema = Bun.YAML.parse(await readFile(join(dir, file), "utf8")) as Schema, c = coverage(schema);
    rows.push({ service: schema.service, frontend: schema.frontend, publishable: VERIFIED.has(schema.service), mapped_percent: c.mapped_percent, unmapped: c.unmapped, unsupported: c.unsupported });
  }
  const result = JSON.stringify(rows);
  if (dir === SCHEMA_DIR) cachedIndex = result;
  return result;
}

export async function schemaOf(service: string, dir = SCHEMA_DIR): Promise<string> {
  // The allowlist doubles as the path-traversal guard: only word characters and hyphens reach the filesystem.
  if (!/^[\w-]+$/.test(service)) throw new CalculatorError("VALIDATION", `No schema for '${service}'; read autocalc://schema/index for the list.`);
  try { return await readFile(join(dir, `${service}.yaml`), "utf8"); }
  catch { throw new CalculatorError("VALIDATION", `No schema for '${service}'; read autocalc://schema/index for the list.`); }
}

/** Agent-facing YAML projection: keeps modes, legal options, defaults, ranges and enum values while dropping portal DOM metadata. */
export async function schemaAgentView(service: string, dir = SCHEMA_DIR): Promise<string> {
  const raw = await schemaOf(service, dir);
  const parsed = Bun.YAML.parse(raw) as Schema;
  const modes = modesOf(service);
  const options = legalOptions(service);
  const controls = (parsed.controls ?? [])
    .filter(c => c.option && !c.unsupported)
    .map(c => ({
      option: c.option,
      ...(c.title ? { title: c.title } : {}),
      ...(c.default !== undefined ? { default: c.default } : {}),
      ...(Array.isArray(c.values) ? { values: c.values } : {}),
      ...(Array.isArray(c.ranges) && c.ranges.length ? { ranges: c.ranges } : {}),
      ...(c.note ? { note: c.note } : {}),
    }));
  return Bun.YAML.stringify({
    service: parsed.service,
    frontend: parsed.frontend,
    publishable: VERIFIED.has(service),
    ...(modes.length ? { modes } : {}),
    ...(options?.length ? { legal_options: options } : {}),
    controls,
  });
}
