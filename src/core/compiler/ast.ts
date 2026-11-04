/** Next-Generation Declarative Quote AST (version: "1").
 * Decouples human/agent declarative quote specifications from vendor calculator internals. */
import { CalculatorError } from "../errors.ts";

export interface QuoteMetadata {
  id: string;
  customer: string;
  title_prefix?: string;
  currency?: string;
}

export interface QuoteHorizon {
  duration: "1m" | "1y";
  billing_policy?: "as-specified" | "recommend-annual";
}

export interface QuoteDefaults {
  provider?: string;
  region?: string;
  availability?: "single-az" | "multi-az";
  billing?: string;
}

export interface ResourceTemplate {
  service: string;
  needs?: Record<string, unknown>;
  options?: Record<string, unknown>;
  billing?: string;
  availability?: "single-az" | "multi-az";
}

export interface EnvironmentConfig {
  region?: string;
  availability?: "single-az" | "multi-az";
  [key: string]: unknown;
}

export interface ResourceDeclaration {
  id: string;
  environment?: string;
  service?: string;
  use?: string;
  quantity?: number;
  billing?: string;
  availability?: "single-az" | "multi-az";
  needs?: Record<string, unknown>;
  spec?: string;
  options?: Record<string, unknown>;
}

export interface QuoteDocument {
  version: "1";
  metadata: QuoteMetadata;
  horizon?: QuoteHorizon;
  defaults?: QuoteDefaults;
  templates?: Record<string, ResourceTemplate>;
  environments?: Record<string, EnvironmentConfig>;
  resources: ResourceDeclaration[];
}

export interface ValidationError {
  path: string;
  message: string;
  expected?: string;
  actual?: unknown;
}

const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === "object" && val !== null && !Array.isArray(val);

export function validateQuoteAst(data: unknown): { ok: true; value: QuoteDocument } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!isRecord(data)) {
    return { ok: false, errors: [{ path: "$", message: "Document must be an object." }] };
  }

  // Version check
  if (data.version !== "1") {
    errors.push({
      path: "version",
      message: `Unsupported or missing specification version. Only version "1" is supported.`,
      expected: `"1"`,
      actual: data.version,
    });
  }

  // Metadata check
  if (!isRecord(data.metadata)) {
    errors.push({ path: "metadata", message: "metadata must be a non-empty object." });
  } else {
    if (typeof data.metadata.id !== "string" || !data.metadata.id.trim()) {
      errors.push({ path: "metadata.id", message: "metadata.id is required and must be a non-empty string." });
    }
    if (typeof data.metadata.customer !== "string" || !data.metadata.customer.trim()) {
      errors.push({ path: "metadata.customer", message: "metadata.customer is required and must be a non-empty string." });
    }
    if (data.metadata.title_prefix !== undefined && typeof data.metadata.title_prefix !== "string") {
      errors.push({ path: "metadata.title_prefix", message: "metadata.title_prefix must be a string." });
    }
    if (data.metadata.currency !== undefined && (typeof data.metadata.currency !== "string" || data.metadata.currency.toUpperCase() !== "USD")) {
      errors.push({ path: "metadata.currency", message: "metadata.currency currently only supports 'USD'." });
    }
  }

  // Horizon check (optional)
  if (data.horizon !== undefined) {
    if (!isRecord(data.horizon)) {
      errors.push({ path: "horizon", message: "horizon must be an object." });
    } else {
      if (data.horizon.duration !== "1m" && data.horizon.duration !== "1y") {
        errors.push({
          path: "horizon.duration",
          message: "horizon.duration must be '1m' or '1y'.",
          expected: "'1m' | '1y'",
          actual: data.horizon.duration,
        });
      }
      if (data.horizon.billing_policy !== undefined &&
          data.horizon.billing_policy !== "as-specified" &&
          data.horizon.billing_policy !== "recommend-annual") {
        errors.push({
          path: "horizon.billing_policy",
          message: "horizon.billing_policy must be 'as-specified' or 'recommend-annual'.",
          expected: "'as-specified' | 'recommend-annual'",
          actual: data.horizon.billing_policy,
        });
      }
    }
  }

  // Defaults check (optional)
  if (data.defaults !== undefined) {
    if (!isRecord(data.defaults)) {
      errors.push({ path: "defaults", message: "defaults must be an object." });
    } else {
      if (data.defaults.availability !== undefined &&
          data.defaults.availability !== "single-az" &&
          data.defaults.availability !== "multi-az") {
        errors.push({
          path: "defaults.availability",
          message: "defaults.availability must be 'single-az' or 'multi-az'.",
          expected: "'single-az' | 'multi-az'",
          actual: data.defaults.availability,
        });
      }
    }
  }

  // Templates check (optional)
  if (data.templates !== undefined) {
    if (!isRecord(data.templates)) {
      errors.push({ path: "templates", message: "templates must be an object mapping names to template definitions." });
    } else {
      for (const [name, tmpl] of Object.entries(data.templates)) {
        if (!isRecord(tmpl)) {
          errors.push({ path: `templates.${name}`, message: `template '${name}' must be an object.` });
          continue;
        }
        if (typeof tmpl.service !== "string" || !tmpl.service.trim()) {
          errors.push({ path: `templates.${name}.service`, message: `template '${name}' requires a valid service name.` });
        }
        if (tmpl.needs !== undefined && !isRecord(tmpl.needs)) {
          errors.push({ path: `templates.${name}.needs`, message: `template '${name}.needs' must be an object.` });
        }
        if (tmpl.options !== undefined && !isRecord(tmpl.options)) {
          errors.push({ path: `templates.${name}.options`, message: `template '${name}.options' must be an object.` });
        }
      }
    }
  }

  // Environments check (optional)
  if (data.environments !== undefined) {
    if (!isRecord(data.environments)) {
      errors.push({ path: "environments", message: "environments must be an object mapping environment names to configs." });
    } else {
      for (const [name, env] of Object.entries(data.environments)) {
        if (!isRecord(env)) {
          errors.push({ path: `environments.${name}`, message: `environment '${name}' must be an object.` });
        }
      }
    }
  }

  // Resources check (required, non-empty array)
  if (!Array.isArray(data.resources)) {
    errors.push({ path: "resources", message: "resources is required and must be an array of resource declarations." });
  } else if (data.resources.length === 0) {
    errors.push({ path: "resources", message: "resources must contain at least one resource declaration." });
  } else {
    const seenIds = new Set<string>();
    data.resources.forEach((res, index) => {
      const p = `resources[${index}]`;
      if (!isRecord(res)) {
        errors.push({ path: p, message: "Resource declaration must be an object." });
        return;
      }
      if (typeof res.id !== "string" || !res.id.trim()) {
        errors.push({ path: `${p}.id`, message: "Resource declaration must have a unique non-empty 'id'." });
      } else {
        if (seenIds.has(res.id)) {
          errors.push({ path: `${p}.id`, message: `Duplicate resource id '${res.id}'. Resource ids must be unique.` });
        }
        seenIds.add(res.id);
      }

      if (!res.service && !res.use) {
        errors.push({ path: p, message: `Resource '${res.id ?? index}' must specify either 'service' or 'use' (a template reference).` });
      }

      if (res.quantity !== undefined && (typeof res.quantity !== "number" || res.quantity <= 0 || !Number.isInteger(res.quantity))) {
        errors.push({ path: `${p}.quantity`, message: "quantity must be a positive integer." });
      }

      if (res.needs !== undefined && !isRecord(res.needs)) {
        errors.push({ path: `${p}.needs`, message: "needs must be an object." });
      }

      if (res.options !== undefined && !isRecord(res.options)) {
        errors.push({ path: `${p}.options`, message: "options must be an object." });
      }
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: data as unknown as QuoteDocument };
}

export function parseQuoteYaml(yamlText: string): QuoteDocument {
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(yamlText);
  } catch (err) {
    throw new CalculatorError("VALIDATION", `Malformed YAML document: ${err instanceof Error ? err.message : String(err)}`);
  }

  const result = validateQuoteAst(parsed);
  if (!result.ok) {
    const detail = result.errors.map(e => `[${e.path}] ${e.message}`).join("\n");
    throw new CalculatorError("VALIDATION", `Invalid declarative quote specification:\n${detail}`, undefined, {
      errors: result.errors,
    });
  }

  return result.value;
}
