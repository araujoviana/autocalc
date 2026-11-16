import type { z } from "zod";
import {
  ListReferenceInput, ListRegionsInput, ListServicesInput, ListMyPriceListsInput, SearchInput, QuoteInput, ConvertInput,
  CompareRegionsInput, CompareModesInput, EmptyInput, CompileQuoteInput, PlanQuoteInput, ApplyQuoteInput,
  ExportQuotesXlsxInput, RenameListInput, DuplicateListInput, LoginInput, DescribeInput, DraftQuoteInput,
  ReviseQuoteInput, InspectDraftInput, RecoverDraftInput, PublishQuoteInput, mcpSchemas,
} from "./schemas.ts";
import { zodValidationError } from "./errors.ts";

import type { ActionContext } from "./types.ts";
export type { ActionContext } from "./types.ts";
import { handlers } from "./actions.ts";

interface ActionOptions {
  readOnly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  openWorld?: boolean;
  mcp?: boolean;
  mcpSchema?: z.ZodType;
}

function action<S extends z.ZodType>(
  description: string,
  schema: S,
  cli: string,
  handler: (context: ActionContext, input: z.output<S>) => Promise<unknown>,
  opts: ActionOptions = {},
) {
  const readOnly = opts.readOnly ?? true;
  const destructive = opts.destructive ?? false;
  const idempotent = opts.idempotent ?? readOnly;
  const openWorld = opts.openWorld ?? true;
  return {
    description,
    schema,
    mcp: opts.mcp ?? true,
    mcpSchema: opts.mcpSchema ?? schema,
    cli: { name: cli },
    annotations: { readOnlyHint: readOnly, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: openWorld },
    async invoke(context: ActionContext, raw: unknown) {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw zodValidationError(parsed.error);
      return handler(context, parsed.data);
    },
  };
}

export const registry = {
  read_price_list: action(
    "Read items and totals from an existing shared price list by ID or Huawei share URL.",
    ListReferenceInput, "read", handlers.read_price_list,
    { mcpSchema: mcpSchemas.ListReferenceInput },
  ),
  list_services: action(
    "List Huawei Cloud calculator services; set publishable_only=true to see verified services, billing modes, and options.",
    ListServicesInput, "services", handlers.list_services,
    { mcpSchema: mcpSchemas.ListServicesInput },
  ),
  list_regions: action(
    "List available region IDs and portal names, optionally filtered by service code or location query.",
    ListRegionsInput, "regions", handlers.list_regions,
    { mcpSchema: mcpSchemas.ListRegionsInput },
  ),
  search_skus: action(
    "Search SKU specs and list prices for a service in a region before writing YAML or calling quote.",
    SearchInput, "search", handlers.search_skus,
    { mcpSchema: mcpSchemas.SearchInput },
  ),
  describe_service: action(
    "Inspect a service's billing modes, catalog groups, and sample specs in a specific region.",
    DescribeInput, "describe", handlers.describe_service,
    { mcpSchema: mcpSchemas.DescribeInput },
  ),
  quote: action(
    "Ad-hoc USD price estimate for exact SKU specs without saving a share link; get specs from search_skus first.",
    QuoteInput, "quote", handlers.quote,
    { mcpSchema: mcpSchemas.QuoteInput },
  ),
  convert_currency: action(
    "Convert a USD amount using Huawei Cloud calculator exchange rates.",
    ConvertInput, "convert", handlers.convert_currency,
    { mcpSchema: mcpSchemas.ConvertInput },
  ),
  compare_regions: action(
    "Compare ad-hoc prices for exact SKUs across multiple regions.",
    CompareRegionsInput, "compare-regions", handlers.compare_regions,
    { mcpSchema: mcpSchemas.CompareRegionsInput },
  ),
  compare_modes: action(
    "Compare on-demand, monthly, and yearly pricing for exact SKUs in a region.",
    CompareModesInput, "compare-modes", handlers.compare_modes,
    { mcpSchema: mcpSchemas.CompareModesInput },
  ),
  supported_services: action(
    "List supported card builders and billing modes.",
    EmptyInput, "supported", handlers.supported_services,
    { mcp: false, openWorld: false },
  ),
  list_my_price_lists: action(
    "List saved price lists in the signed-in account, newest first; requires auth_login.",
    ListMyPriceListsInput, "lists", handlers.list_my_price_lists,
    { mcpSchema: mcpSchemas.ListMyPriceListsInput },
  ),
  delete_price_list: action(
    "Permanently delete a saved price list; confirm with the user first.",
    ListReferenceInput, "delete", handlers.delete_price_list,
    { readOnly: false, destructive: true, idempotent: true, mcpSchema: mcpSchemas.ListReferenceInput },
  ),
  rename_price_list: action(
    "Rename a saved price list in the signed-in account.",
    RenameListInput, "rename", handlers.rename_price_list,
    { readOnly: false, idempotent: true, mcpSchema: mcpSchemas.RenameListInput },
  ),
  duplicate_price_list: action(
    "Duplicate a saved price list and optionally rename the copy.",
    DuplicateListInput, "duplicate", handlers.duplicate_price_list,
    { readOnly: false, idempotent: false, mcpSchema: mcpSchemas.DuplicateListInput },
  ),
  draft_quote: action(
    "Alternative interactive flow (prefer plan_quote/apply_quote with YAML): create a local draft and rank SKU candidates.",
    DraftQuoteInput, "draft-quote", handlers.draft_quote,
    { readOnly: false, idempotent: false, mcpSchema: mcpSchemas.DraftQuoteInput },
  ),
  revise_quote: action(
    "Record chosen SKU specs for pending requirements in an interactive draft.",
    ReviseQuoteInput, "revise-quote", handlers.revise_quote,
    { readOnly: false, idempotent: true, openWorld: false, mcpSchema: mcpSchemas.ReviseQuoteInput },
  ),
  publish_quote: action(
    "Publish a decided interactive draft through the verification gate and return a share link; requires auth_login.",
    PublishQuoteInput, "publish-quote", handlers.publish_quote,
    { readOnly: false, idempotent: true, mcpSchema: mcpSchemas.PublishQuoteInput },
  ),
  compile_quote: action(
    "Compile a declarative quote file (version: '1') offline in under 50ms into normalized resources.",
    CompileQuoteInput, "compile", handlers.compile_quote,
    { mcp: false, openWorld: false },
  ),
  plan_quote: action(
    "Primary step 1: compile and validate a quote YAML (version '1' preferred) offline against service schemas, resolve SKUs, rate, and write its lockfile.",
    PlanQuoteInput, "plan", handlers.plan_quote,
    { readOnly: false, idempotent: true, mcpSchema: mcpSchemas.PlanQuoteInput },
  ),
  apply_quote: action(
    "Primary step 2: publish a planned quote YAML through the 3-way verification gate (auto-sharding if large) and return share link(s); requires auth_login.",
    ApplyQuoteInput, "apply", handlers.apply_quote,
    { readOnly: false, idempotent: false, mcpSchema: mcpSchemas.ApplyQuoteInput },
  ),
  export_quotes_xlsx: action(
    "Export published price lists and optional draft decisions into a 4-sheet .xlsx workbook.",
    ExportQuotesXlsxInput, "export-quotes-xlsx", handlers.export_quotes_xlsx,
    { readOnly: false, idempotent: false, mcpSchema: mcpSchemas.ExportQuotesXlsxInput },
  ),
  list_drafts: action(
    "List local quote drafts.",
    EmptyInput, "list-drafts", handlers.list_drafts,
    { mcp: false, openWorld: false },
  ),
  inspect_draft: action(
    "Inspect a draft's publication state, or omit draft_id to list recent local drafts.",
    InspectDraftInput, "inspect-draft", handlers.inspect_draft,
    { openWorld: false, mcpSchema: mcpSchemas.InspectDraftInput },
  ),
  recover_draft: action(
    "Reset a draft stuck in unknown_outcome after confirming via list_my_price_lists that no remote list was created.",
    RecoverDraftInput, "recover-draft", handlers.recover_draft,
    { readOnly: false, destructive: true, idempotent: true, openWorld: false, mcpSchema: mcpSchemas.RecoverDraftInput },
  ),
  auth_status: action(
    "Check local Huawei Cloud session status without network calls.",
    EmptyInput, "auth status", handlers.auth_status,
    { openWorld: false },
  ),
  auth_login: action(
    "Open a browser window for the user to sign in to Huawei Cloud.",
    LoginInput, "login", handlers.auth_login,
    { readOnly: false, idempotent: true, mcpSchema: mcpSchemas.LoginInput },
  ),
} as const;
