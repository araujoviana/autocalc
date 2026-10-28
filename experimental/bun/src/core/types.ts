import type { Catalog } from "./catalog.ts";
import type { ListSession } from "./lists.ts";
import type { AuthManager } from "./auth.ts";
export interface ActionContext { reader: { getUncached(url: string): Promise<unknown> }; catalog: Catalog; rating: (body: Record<string, unknown>) => Promise<Record<string, unknown>>; createList: (payload: Record<string, unknown>) => Promise<string>; lists: Pick<ListSession, "lists" | "create" | "update" | "delete" | "copy">; auth: Pick<AuthManager, "status" | "login">; signal?: AbortSignal }
