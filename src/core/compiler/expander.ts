/** Machine Archetype Template Expander.
 * Resolves reusable machine archetypes (`templates`), environments, and defaults
 * into fully resolved concrete resource definitions with deterministic overrides. */
import { CalculatorError } from "../errors.ts";
import { RegionResolver } from "../regions.ts";
import type { QuoteDocument, ResourceDeclaration, ResourceTemplate } from "./ast.ts";
import { normalizeServiceAlias } from "./normalizer.ts";

export interface ExpandedResource {
  id: string;
  environment?: string | undefined;
  service: string;
  region: string;
  billing: string;
  availability: "single-az" | "multi-az";
  quantity: number;
  needs?: Record<string, unknown> | undefined;
  spec?: string | undefined;
  options?: Record<string, unknown> | undefined;
  sourceTemplate?: string | undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep merges source record into target record. Keys in source take precedence. */
function mergeRecords(target: Record<string, unknown> | undefined, source: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!target && !source) return undefined;
  if (!target) return { ...source };
  if (!source) return { ...target };

  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (isRecord(value) && isRecord(result[key])) {
      result[key] = mergeRecords(result[key] as Record<string, unknown>, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function expandResources(doc: QuoteDocument): ExpandedResource[] {
  const templates = doc.templates ?? {};
  const environments = doc.environments ?? {};
  const defaults = doc.defaults ?? {};

  const expanded: ExpandedResource[] = [];

  for (const res of doc.resources) {
    let tmpl: ResourceTemplate | undefined;
    if (res.use) {
      tmpl = templates[res.use];
      if (!tmpl) {
        const available = Object.keys(templates).sort();
        const hint = available.length ? ` Available templates: ${available.join(", ")}.` : " No templates are defined.";
        throw new CalculatorError(
          "VALIDATION",
          `Resource '${res.id}' references undefined template '${res.use}'.${hint}`
        );
      }
    }

    const rawService = (res.service ?? tmpl?.service)?.toLowerCase().trim();
    if (!rawService) {
      throw new CalculatorError(
        "VALIDATION",
        `Resource '${res.id}' has no service specified and does not inherit one from template '${res.use}'.`
      );
    }
    const service = normalizeServiceAlias(rawService);

    // Resolve environment
    let envRegion: string | undefined;
    let envAvailability: "single-az" | "multi-az" | undefined;
    if (res.environment) {
      const env = environments[res.environment];
      if (!env) {
        const available = Object.keys(environments).sort();
        const hint = available.length ? ` Available environments: ${available.join(", ")}.` : "";
        throw new CalculatorError(
          "VALIDATION",
          `Resource '${res.id}' references undefined environment '${res.environment}'.${hint}`
        );
      }
      envRegion = env.region;
      envAvailability = env.availability;
    }

    // Precedence: resource -> env -> template -> defaults
    const rawRegion = (res as any).region ?? envRegion ?? defaults.region;
    if (!rawRegion) {
      throw new CalculatorError(
        "VALIDATION",
        `Resource '${res.id}' has no region specified (set via defaults.region, environment, or card).`
      );
    }
    const resolver = new RegionResolver();
    const candidates = resolver.candidates(String(rawRegion));
    const region = candidates.length === 1 ? candidates[0]! : String(rawRegion).trim();

    const availability = res.availability ?? envAvailability ?? tmpl?.availability ?? defaults.availability ?? "single-az";
    const billing = (res.billing ?? tmpl?.billing ?? defaults.billing ?? "monthly").toLowerCase();
    const quantity = res.quantity ?? 1;

    // Merge needs and options
    const mergedNeeds = mergeRecords(tmpl?.needs, res.needs);
    const mergedOptions = mergeRecords(tmpl?.options, res.options);

    expanded.push({
      id: res.id,
      environment: res.environment,
      service,
      region,
      billing,
      availability,
      quantity,
      needs: mergedNeeds,
      spec: res.spec,
      options: mergedOptions,
      sourceTemplate: res.use,
    });
  }

  return expanded;
}
