import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CalculatorError } from "./errors.ts";

// shortcut: reads the Python tree's committed schema files in place; ts-parity 8.2 moves them with the repo root.
export const SCHEMA_DIR = process.env.AUTOCALC_SCHEMA_DIR ?? join(import.meta.dir, "..", "..", "..", "..", "src", "autocalc", "schema", "files");

interface Control { id: string; option?: string; unsupported?: boolean }
interface Schema { service: string; frontend: string; controls: Control[] }

/** Mapped = has an option name; unsupported = deliberately not mapped; the rest is unmapped (mirrors Python coverage). */
export function coverage(schema: Schema) {
  const mapped = schema.controls.filter(c => c.option && !c.unsupported).length;
  const unmapped = schema.controls.filter(c => !c.option && !c.unsupported).length, total = mapped + unmapped;
  return { mapped_percent: total ? Math.round(100 * mapped / total) : 100, unmapped };
}

export async function schemaIndex(dir = SCHEMA_DIR): Promise<string> {
  const rows = [];
  for (const file of (await readdir(dir)).filter(name => name.endsWith(".yaml")).sort()) {
    const schema = Bun.YAML.parse(await readFile(join(dir, file), "utf8")) as Schema, c = coverage(schema);
    rows.push({ service: schema.service, frontend: schema.frontend, mapped_percent: c.mapped_percent, unmapped: c.unmapped, resource: `autocalc://schema/${schema.service}` });
  }
  return JSON.stringify(rows, null, 2);
}

export async function schemaOf(service: string, dir = SCHEMA_DIR): Promise<string> {
  // The allowlist doubles as the path-traversal guard: only word characters and hyphens reach the filesystem.
  if (!/^[\w-]+$/.test(service)) throw new CalculatorError("VALIDATION", `No schema for '${service}'; read autocalc://schema/index for the list.`);
  try { return await readFile(join(dir, `${service}.yaml`), "utf8"); }
  catch { throw new CalculatorError("VALIDATION", `No schema for '${service}'; read autocalc://schema/index for the list.`); }
}
