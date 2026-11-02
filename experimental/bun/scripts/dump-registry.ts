// Prints {tool: {properties: [...], required: [...]}} for the parity diff (scripts/parity-registry.py).
import { z } from "zod";
import { registry } from "../src/core/registry.ts";

const out: Record<string, { properties: string[]; required: string[] }> = {};
for (const [name, entry] of Object.entries(registry)) {
  const json = z.toJSONSchema(entry.schema, { unrepresentable: "any", io: "input" }) as { properties?: object; required?: string[] };
  out[name] = { properties: Object.keys(json.properties ?? {}).sort(), required: [...(json.required ?? [])].sort() };
}
console.log(JSON.stringify(out));
