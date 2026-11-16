#!/usr/bin/env bun
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import pkg from "../package.json";
import { createCore, CalculatorError, normalizeError } from "./core/index.ts";
import { zodValidationError } from "./core/errors.ts";
import { registry } from "./core/registry.ts";
import { schemaAgentView, schemaIndex } from "./core/schema-files.ts";
import { notice } from "./core/update.ts";

export const QUOTE_WORKFLOW = [
  "Primary workflow (declarative YAML — stable, reviewable, auto-sharded):",
  "1. Discover services/options via autocalc://schema/index and autocalc://schema/<service> (or list_services / list_regions / search_skus).",
  "2. Write a version: \"1\" YAML file (metadata{id, customer, title_prefix?}, horizon{duration: 1m|1y}, defaults{region, billing}, optional templates/environments, resources[{id, service|use, environment?, quantity?, billing?, needs?, spec?, options?}]). Use explicit units in version \"1\" options (\"32 GiB\", \"100 GB\", \"10 Mbit/s\", \"5 TB/mo\"); 730 h = 1 month.",
  "3. Call plan_quote(path) to validate offline, resolve SKUs, rate, and write the lockfile.",
  "4. Show any pending candidates or warnings to the user and update the YAML until plan_quote resolves cleanly.",
  "5. Call apply_quote(path) to run the 3-way verification gate and return the share link(s) (requires auth_login).",
  "Ad-hoc estimates (no share link): use quote, compare_modes, or compare_regions with exact SKUs from search_skus.",
  "Interactive fallback: draft_quote -> revise_quote -> publish_quote (and inspect_draft / recover_draft if needed).",
].join("\n");

const MCP_INSTRUCTIONS = [
  QUOTE_WORKFLOW,
  "",
  "Error recovery: on AUTH_REQUIRED/AUTH_EXPIRED call auth_login; on SPEC_NOT_FOUND call search_skus; on REGION_* call list_regions; on VALIDATION for YAML options read autocalc://schema/<service>.",
].join("\n");

const SKU_NOISE = ["Remark:", "Spot Duartion:", "Spot Duration:"];

function summarizeChecks(checks: unknown): Record<string, unknown> {
  if (!Array.isArray(checks)) return {};
  const list = checks as Array<Record<string, unknown>>;
  const noteworthy = list.filter(c => c.ok === false || c.edit_skipped || c.rating_skipped);
  return {
    verified_cards: list.filter(c => c.ok !== false).length,
    ...(noteworthy.length ? { checks: noteworthy } : {}),
  };
}

export function shapeMcpResult(name: string, input: Record<string, unknown>, result: unknown): unknown {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    if (name === "list_my_price_lists" && Array.isArray(result)) {
      const limit = typeof input.limit === "number" ? input.limit : 20;
      return {
        count: result.length,
        lists: result,
        ...(result.length >= limit ? { truncated: true, hint: "Pass query or a higher limit to view more lists." } : {}),
      };
    }
    return result;
  }
  const obj = result as Record<string, unknown>;
  if (name === "auth_status") {
    const note = notice();
    return note ? { ...obj, update_notice: note } : obj;
  }
  if (name === "plan_quote") {
    const cards = Array.isArray(obj.cards)
      ? obj.cards.map(c => {
          if (!c || typeof c !== "object") return c;
          const row = { ...(c as Record<string, unknown>) };
          if (Array.isArray(row.unmapped_options) && row.unmapped_options.length === 0) delete row.unmapped_options;
          return row;
        })
      : obj.cards;
    const shards = Array.isArray(obj.shards)
      ? obj.shards.map((s: Record<string, unknown>) => ({
          index: s.index,
          title: s.title,
          cardCount: s.cardCount,
          estimatedBytes: s.estimatedBytes,
        }))
      : undefined;
    return {
      draft_id: obj.draft_id,
      cards,
      pending: obj.pending,
      ...(shards ? { shards } : {}),
    };
  }
  if (name === "apply_quote" || name === "publish_quote") {
    if (Array.isArray(obj.shards)) {
      return {
        name: obj.name,
        shards: obj.shards.map((s: Record<string, unknown>) => ({
          index: s.index,
          title: s.title,
          id: s.id,
          url: s.url,
          cardCount: s.cardCount,
          ...summarizeChecks(s.checks),
        })),
        ...(Array.isArray(obj.warnings) && obj.warnings.length ? { warnings: obj.warnings } : {}),
      };
    }
    const { checks, ...rest } = obj;
    return { ...rest, ...summarizeChecks(checks) };
  }
  if (name === "quote" && Array.isArray(obj.items)) {
    return {
      ...obj,
      items: obj.items.map(item => {
        if (!item || typeof item !== "object") return item;
        const row = { ...(item as Record<string, unknown>) };
        if (row.size === null) delete row.size;
        if (typeof row.description === "string") {
          row.description = row.description.split(";").filter(part => !SKU_NOISE.some(n => part.startsWith(n))).join(";");
        }
        return row;
      }),
    };
  }
  return result;
}

function mcpHintFor(norm: CalculatorError): string | undefined {
  const hint = norm.hint;
  if (norm.code === "AUTH_REQUIRED" || norm.code === "AUTH_EXPIRED" || norm.code === "AUTH_LOGIN_FAILED") {
    return "Call auth_login to sign in, then retry.";
  }
  if (norm.code === "SPEC_NOT_FOUND") return hint && !hint.includes("autocalc ") ? hint : "Call search_skus(service, region) to find valid SKU specs.";
  if (norm.code === "REGION_NOT_FOUND" || norm.code === "REGION_AMBIGUOUS") return "Call list_regions(service?, query?) to see valid region IDs.";
  if (norm.code === "SERVICE_NOT_SOLD") return "Call list_services to see valid calculator service codes.";
  if (norm.code === "MODE_NOT_OFFERED") return "Call describe_service(service, region) to check supported billing modes in this region.";
  if (norm.code === "BROWSER_UNAVAILABLE") return "Ask the user to install Chromium by running 'autocalc install-browser'.";
  if (norm.code === "PAGE_ENCODE_FAILED") return "Check autocalc://schema/<service> for valid options; if the portal UI changed, ask the user to run 'autocalc doctor'.";
  if (!hint) return undefined;
  if (hint.includes("autocalc schema coverage")) return "Read resource autocalc://schema/<service> for legal options and ranges.";
  if (hint.includes("autocalc login")) return "Call auth_login to sign in, then retry.";
  if (hint.includes("autocalc search")) return "Call search_skus(service, region, query?) to find valid SKU specs.";
  if (hint.includes("--headed") || hint.includes("AUTOCALC_PAGE_HEADED") || hint.includes("autocalc doctor")) {
    return "Ask the user to run 'autocalc doctor' if the issue persists.";
  }
  return hint;
}

export function formatMcpError(error: unknown) {
  const norm = normalizeError(error);
  const payload = norm.toJSON();
  const hint = mcpHintFor(norm);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify({ ...payload, ...(hint ? { hint } : {}) }) }],
  };
}

export async function main(): Promise<void> {
  const core = createCore();
  const server = new McpServer({ name: "autocalc", version: pkg.version }, { instructions: MCP_INSTRUCTIONS });
  const invoke = async (name: string, rawInput: unknown, signal: AbortSignal) => {
    const entry = registry[name as keyof typeof registry];
    const parsed = entry.mcpSchema.safeParse(rawInput);
    if (!parsed.success) return formatMcpError(zodValidationError(parsed.error));
    try {
      const result = await core.invoke(name, parsed.data, { signal });
      return { content: [{ type: "text" as const, text: JSON.stringify(shapeMcpResult(name, parsed.data as Record<string, unknown>, result)) }] };
    } catch (error) {
      return formatMcpError(error);
    }
  };
  for (const [name, entry] of Object.entries(registry)) {
    if (!entry.mcp) continue;
    server.registerTool(name, { description: entry.description, inputSchema: entry.mcpSchema, annotations: entry.annotations }, async () => {
      throw new Error("unreachable: calls are dispatched by the CallTool handler below");
    });
  }
  // The SDK's tool wrapper validates before invoking the handler and renders
  // input failures as plain text. Dispatch calls through the shared validator
  // so domain errors have the same structured shape as other action failures.
  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const name = request.params.name;
    if (!Object.hasOwn(registry, name) || !registry[name as keyof typeof registry].mcp) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool ${name}`);
    }
    return invoke(name, request.params.arguments ?? {}, extra.signal);
  });
  server.registerResource("schema_index", "autocalc://schema/index", { description: "All calculator services with frontend version, publishable status, and schema coverage.", mimeType: "application/json" },
    async uri => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: await schemaIndex() }] }));
  server.registerResource("schema", new ResourceTemplate("autocalc://schema/{service}", { list: undefined }), { description: "Service schema for YAML/draft options: billing modes, legal options, defaults, ranges. No login needed.", mimeType: "application/yaml" },
    async (uri, { service }) => ({ contents: [{ uri: uri.href, mimeType: "application/yaml", text: await schemaAgentView(String(service)) }] }));
  server.registerPrompt("quote_workflow", { description: "Standard workflow prioritizing declarative YAML (plan_quote -> apply_quote) for stable Huawei Cloud quotes" }, () => ({ messages: [{ role: "user", content: { type: "text", text: QUOTE_WORKFLOW } }] }));
  const transport = new StdioServerTransport();
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => { await server.close(); await core.close(); })();
  server.server.onclose = () => { void core.close(); };
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) process.once(signal, () => { void close().finally(() => { process.exitCode = code; }); });
  await server.connect(transport);
}
if (import.meta.main) await main();
