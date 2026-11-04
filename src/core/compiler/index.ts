/** Declarative Quote Compiler Pipeline.
 * Orchestrates parsing, template expansion, dimensional unit normalization,
 * horizon scaling, and invariant enforcement entirely offline in <50ms. */
import { parseQuoteYaml, type QuoteDocument } from "./ast.ts";
import { expandResources, type ExpandedResource } from "./expander.ts";
import { normalizeHorizon, type NormalizedResource } from "./horizon.ts";
import { parseBandwidth, parseCapacity, parseDuration, parseRequestRate, parseTraffic } from "./units.ts";

export * from "./ast.ts";
export * from "./units.ts";
export * from "./expander.ts";
export * from "./horizon.ts";
export * from "./anti-split.ts";

export interface CompiledQuote {
  document: QuoteDocument;
  resources: NormalizedResource[];
}

/** Validates known dimensional fields on options or needs offline. */
function validateResourceUnits(res: NormalizedResource): void {
  const opts = res.options ?? {};
  const needs = res.needs ?? {};

  // Check capacity fields if present
  for (const [key, val] of Object.entries({ ...needs, ...opts })) {
    const k = key.toLowerCase();
    if (k === "capacity" || k === "storage" || k === "memory" || k === "size" || k.endsWith("_size") || k.endsWith("_capacity")) {
      if (typeof val === "number") {
        parseCapacity(val, `${res.id}.${key}`);
      }
    } else if (k === "bandwidth" || k.endsWith("_bandwidth")) {
      if (typeof val === "number") {
        parseBandwidth(val, `${res.id}.${key}`);
      }
    } else if (k === "traffic" || k.endsWith("_traffic")) {
      if (typeof val === "number") {
        parseTraffic(val, `${res.id}.${key}`);
      }
    }
  }
}

/** Compiles a raw declarative quote YAML string into fully resolved, normalized resources offline. */
export function compileQuote(yamlText: string): CompiledQuote {
  const document = parseQuoteYaml(yamlText);
  const expanded = expandResources(document);
  const normalized = normalizeHorizon(expanded, document.horizon);

  // Validate units across all resources
  for (const res of normalized) {
    validateResourceUnits(res);
  }

  return {
    document,
    resources: normalized,
  };
}
