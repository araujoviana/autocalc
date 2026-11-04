/** What the core needs from a cloud: requirement in, priced candidates out (ADR-0015). */
import type { Candidate, Requirement } from "./model.ts";

export interface Provider {
  readonly name: string;
  /** Priced SKUs that could serve `req`; throws an actionable error when the region cannot. */
  candidates(req: Requirement): Promise<Candidate[]>;
  /** List prices of one SKU per billing mode (amounts as sold: monthly per month, yearly per year, ondemand per hour); null when unknown. */
  prices?(req: Requirement, spec: string): Promise<Record<string, number> | null>;
}
