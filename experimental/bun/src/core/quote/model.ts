/** Provider-neutral quote model: plain data that round-trips through the same JSON as Python (ADR-0015). */
import { CalculatorError } from "../errors.ts";
import { formatDecimal, parseDecimal, type Dec } from "./decimal.ts";

export const VERSION = 1;

export function invalid(message: string, field?: string, allowed?: unknown[]): CalculatorError {
  const details = { ...(field ? { field } : {}), ...(allowed?.length ? { allowed } : {}) };
  const hint = allowed?.length ? `Valid ${field ?? "values"}: ${allowed.join(", ")}` : undefined;
  return new CalculatorError("VALIDATION", message, hint, Object.keys(details).length ? details : undefined);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const BILLING = ["ondemand", "monthly", "yearly", "ri"];

export interface Requirement {
  id: string; service: string; region: string; billing: string; quantity: number;
  needs: Record<string, number>; spec: string | null; az: string | null; group: string | null;
  options: Record<string, unknown>;
}

/** Validate and fill defaults; key order matches Python's dataclass so saved JSON is identical. */
export function requirement(input: Partial<Requirement> & Pick<Requirement, "id" | "service" | "region" | "billing">): Requirement {
  const r: Requirement = { id: input.id, service: input.service, region: input.region, billing: input.billing,
    quantity: input.quantity ?? 1, needs: input.needs ?? {}, spec: input.spec ?? null, az: input.az ?? null,
    group: input.group ?? null, options: input.options ?? {} };
  for (const name of ["id", "service", "region", "billing"] as const) if (!nonempty(r[name])) throw invalid(`${name} must be a nonempty string.`, name);
  for (const name of ["spec", "group"] as const) if (r[name] !== null && !nonempty(r[name])) throw invalid(`${name} must be a nonempty string when supplied.`, name);
  if (r.az !== null && !nonempty(r.az)) throw invalid("az must be a nonempty string when supplied.", "az");
  if (!Number.isInteger(r.quantity) || r.quantity < 1) throw invalid("quantity must be a positive integer.", "quantity");
  if (!BILLING.includes(r.billing)) throw invalid("Unknown billing mode.", "billing");
  if (!isObject(r.options) || !isObject(r.needs)) throw invalid("options and needs must be objects.");
  for (const [name, value] of Object.entries(r.needs)) {
    if (!["vcpus", "memory_gb"].includes(name)) throw invalid(`Unknown need '${name}'.`, "needs");
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw invalid("Needs must be finite nonnegative numbers.", "needs");
  }
  return r;
}

const REQUIREMENT_KEYS = ["id", "service", "region", "billing", "quantity", "needs", "spec", "az", "group", "options"];
export function requirementFromJSON(d: unknown): Requirement {
  if (!isObject(d)) throw invalid("Each requirement must be an object.");
  const unknown = Object.keys(d).filter(k => !REQUIREMENT_KEYS.includes(k)).sort();
  const missing = ["id", "service", "region", "billing"].filter(k => !(k in d)).sort();
  if (unknown.length || missing.length) throw invalid(`Invalid requirement keys: unknown=${JSON.stringify(unknown)}, missing=${JSON.stringify(missing)}.`);
  return requirement(d as never);
}

export interface Candidate { spec: string; region: string; billing: string; price: Dec; has: Record<string, number>; generation: number; description: string }
export const candidate = (spec: string, region: string, billing: string, price: string | Dec, has: Record<string, number> = {}, generation = 0, description = ""): Candidate =>
  ({ spec, region, billing, price: typeof price === "string" ? parseDecimal(price) : price, has, generation, description });
export const candidateToJSON = (c: Candidate) => ({ spec: c.spec, region: c.region, billing: c.billing, price: formatDecimal(c.price), has: c.has, generation: c.generation, description: c.description });
export const candidateFromJSON = (d: Record<string, unknown>): Candidate =>
  candidate(String(d.spec), String(d.region), String(d.billing), String(d.price), (d.has ?? {}) as Record<string, number>, Number(d.generation ?? 0), String(d.description ?? ""));

export interface Decision { requirement_id: string; spec: string; by: string; justification: string }

export class Draft {
  constructor(
    readonly id: string, readonly customer: string, readonly provider: string,
    public requirements: Requirement[] = [], public decisions: Decision[] = [],
    public created: string = new Date().toISOString(), public version: number = VERSION,
    public publishing = false, public publication: Record<string, unknown> | null = null,
  ) {}

  /** Record a decision, replacing an earlier one for the same requirement. */
  addDecision(d: Decision): void {
    if (!["auto", "human"].includes(d.by)) throw invalid("A decision is made by 'auto' or 'human'.", "by", ["auto", "human"]);
    if (typeof d.justification !== "string" || d.justification.trim() === "") throw invalid("A decision needs a justification.", "justification");
    const ids = this.requirements.map(r => r.id);
    if (!ids.includes(d.requirement_id)) throw invalid(`No requirement '${d.requirement_id}' in draft ${this.id}.`, "requirement_id", ids);
    this.decisions = [...this.decisions.filter(x => x.requirement_id !== d.requirement_id), d];
  }

  pending(): string[] {
    const decided = new Set(this.decisions.map(d => d.requirement_id));
    return this.requirements.filter(r => !decided.has(r.id)).map(r => r.id);
  }

  toJSON() {
    return { version: this.version, id: this.id, customer: this.customer, provider: this.provider, created: this.created,
      requirements: this.requirements, decisions: this.decisions, publication: this.publication, publishing: this.publishing };
  }

  static fromJSON(d: Record<string, any>): Draft {
    return new Draft(d.id, d.customer, d.provider, (d.requirements as unknown[]).map(requirementFromJSON),
      (d.decisions as Decision[]).map(x => ({ ...x })), d.created, d.version ?? VERSION, d.publishing ?? false, d.publication ?? null);
  }
}
