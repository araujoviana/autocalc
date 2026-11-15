import type { Catalog } from "./catalog.ts";
import type { ListSession } from "./lists.ts";
import type { AuthManager } from "./auth.ts";
import type { Provider } from "./quote/provider.ts";
import type { DraftStore } from "./quote/store.ts";

/** What publishing needs from the outside world; tests substitute fakes (Python monkeypatches the same seams). */
export interface PublishPorts {
  /** The requested page state for one builder input, resolved against the catalog and never rated. */
  form(input: Record<string, any>): Promise<Record<string, any>>;
  /** The card the calculator page builds from that state. */
  encode(service: string, rewriteValue: Record<string, any>): Promise<Record<string, any>>;
  /** Save, verify on the website, or delete and throw GATE_FAILED. */
  publish(name: string, cards: Record<string, any>[], options: { settlement: "total" | "monthly"; currency: string }): Promise<Record<string, any>>;
  /** The frontend version the live calculator page loads, or undefined when it cannot be read. */
  liveVersion(): Promise<string | undefined>;
}

export type DegradationTier =
  | "FULL_GATE_VERIFIED"
  | "RATING_VERIFIED_EDIT_SKIPPED"
  | "CACHED_CATALOG_ESTIMATE"
  | "EXPORT_ONLY";

export interface ActionContext { reader: { getUncached(url: string): Promise<unknown> }; catalog: Catalog; rating: (body: Record<string, unknown>) => Promise<Record<string, unknown>>; lists: Pick<ListSession, "lists" | "create" | "update" | "delete" | "copy">; auth: Pick<AuthManager, "status" | "login">; provider: Provider; drafts: DraftStore; publish?: PublishPorts; signal?: AbortSignal }
