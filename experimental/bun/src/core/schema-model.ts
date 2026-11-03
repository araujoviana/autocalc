/** The schema file format (mirrors `src/autocalc/schema/model.py`); the YAML files are the shared contract (D7). */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { SCHEMA_DIR } from "./schema-files.ts";

const Range = z.strictObject({
  min: z.number().nullish(), max: z.number().nullish(), step: z.number().default(1), default: z.number().nullish(), unit: z.string().nullish(),
  when: z.string().nullish(), // regex on the selected resource spec code; absent = always
});
const Control = z.strictObject({
  id: z.string(), kind: z.string(), title: z.string().nullish(), value_type: z.string().nullish(), option_key: z.string().nullish(),
  default: z.union([z.string(), z.number()]).nullish(), values: z.literal("catalog").nullish(), ranges: z.array(Range).default([]),
  after: z.array(z.string()).default([]), after_source: z.enum(["order", "observed"]).default("order"),
  option: z.string().nullish(), unsupported: z.boolean().default(false), note: z.string().nullish(), modes: z.array(z.string()).default([]),
});
export const ServiceSchema = z.strictObject({ service: z.string(), frontend: z.union([z.string(), z.number()]).nullish(), controls: z.array(Control) });
export type ServiceSchema = z.output<typeof ServiceSchema>;

/** The committed schema of a service, or null when none exists. A malformed file throws. */
export async function loadService(service: string, dir = SCHEMA_DIR): Promise<ServiceSchema | null> {
  if (!/^[\w-]+$/.test(service)) return null;
  let text: string;
  try { text = await readFile(join(dir, `${service}.yaml`), "utf8"); } catch { return null; }
  return ServiceSchema.parse(Bun.YAML.parse(text));
}
