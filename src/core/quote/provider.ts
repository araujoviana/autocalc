/** What the core needs from a cloud: requirement in, priced candidates out (ADR-0015). */
import type { Candidate, Requirement } from "./model.ts";

export interface Provider {
  readonly name: string;
  /** Priced SKUs that could serve `req`; throws an actionable error when the region cannot. */
  candidates(req: Requirement): Promise<Candidate[]>;
}
