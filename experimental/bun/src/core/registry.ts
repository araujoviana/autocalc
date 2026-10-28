import type { z } from "zod";
import { ListReferenceInput, ListRegionsInput, ListServicesInput, SearchInput, QuoteInput, ConvertInput, CompareRegionsInput, CompareModesInput, EmptyInput, CreateListInput, RenameListInput, DuplicateListInput, LoginInput, DescribeInput } from "./schemas.ts";
import { CalculatorError } from "./errors.ts";

import type { ActionContext } from "./types.ts";
export type { ActionContext } from "./types.ts";
import { handlers } from "./actions.ts";
function action<S extends z.ZodType>(description: string, schema: S, cli: string, handler: (context: ActionContext, input: z.output<S>) => Promise<unknown>, readOnly = true, destructive = false) {
  return { description, schema, cli: { name: cli }, annotations: { readOnlyHint: readOnly, destructiveHint: destructive },
    async invoke(context: ActionContext, raw: unknown) {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new CalculatorError("VALIDATION", "Invalid action input", undefined, { issues: parsed.error.issues });
      return handler(context, parsed.data);
    } };
}

export const registry = {
  read_price_list: action("Read a shared price list by ID or URL", ListReferenceInput, "read", handlers.read_price_list),
  list_services: action("List services with a price calculator", ListServicesInput, "services", handlers.list_services),
  list_regions: action("List regions or resolve a friendly region name", ListRegionsInput, "regions", handlers.list_regions),
  search_skus: action("Search calculator SKUs in a region", SearchInput, "search", handlers.search_skus),
  describe_service: action("Describe available service modes and catalog groups", DescribeInput, "describe", handlers.describe_service),
  quote: action("Quote products in USD", QuoteInput, "quote", handlers.quote),
  convert_currency: action("Convert a USD amount with Huawei exchange rates", ConvertInput, "convert", handlers.convert_currency),
  compare_regions: action("Compare prices across regions", CompareRegionsInput, "compare-regions", handlers.compare_regions),
  compare_modes: action("Compare billing modes", CompareModesInput, "compare-modes", handlers.compare_modes),
  supported_services: action("List supported card builders and billing modes", EmptyInput, "supported", handlers.supported_services),
  create_price_list: action("Build calculator cards and optionally save a price list", CreateListInput, "create", handlers.create_price_list, false),
  list_my_price_lists: action("List saved price lists in the current account", EmptyInput, "lists", handlers.list_my_price_lists),
  delete_price_list: action("Delete the specified price list; confirm with the user first", ListReferenceInput, "delete", handlers.delete_price_list, false, true),
  rename_price_list: action("Rename a saved price list", RenameListInput, "rename", handlers.rename_price_list, false),
  duplicate_price_list: action("Copy a price list, optionally renaming the copy", DuplicateListInput, "duplicate", handlers.duplicate_price_list, false),
  auth_status: action("Show local authentication status without a live probe", EmptyInput, "auth status", handlers.auth_status),
  auth_login: action("Open a browser for manual Huawei Cloud sign-in", LoginInput, "login", handlers.auth_login, false),
} as const;
