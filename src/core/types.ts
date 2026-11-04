import type { Catalog } from "./catalog.ts";
import type { ListSession } from "./lists.ts";
import type { AuthManager } from "./auth.ts";
import type { Provider } from "./quote/provider.ts";
import type { DraftStore } from "./quote/store.ts";
import type { PublishPorts } from "./publish.ts";
export type DegradationTier =
  | "FULL_GATE_VERIFIED"
  | "RATING_VERIFIED_EDIT_SKIPPED"
  | "CACHED_CATALOG_ESTIMATE"
  | "EXPORT_ONLY";

export interface ActionContext { reader: { getUncached(url: string): Promise<unknown> }; catalog: Catalog; rating: (body: Record<string, unknown>) => Promise<Record<string, unknown>>; lists: Pick<ListSession, "lists" | "create" | "update" | "delete" | "copy">; auth: Pick<AuthManager, "status" | "login">; provider: Provider; drafts: DraftStore; publish?: PublishPorts; signal?: AbortSignal }
