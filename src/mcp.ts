#!/usr/bin/env bun
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import pkg from "../package.json";
import { createCore, CalculatorError, normalizeError } from "./core/index.ts";
import { registry } from "./core/registry.ts";
import { schemaIndex, schemaOf } from "./core/schema-files.ts";
import { withNotice } from "./core/update.ts";

export const QUOTE_WORKFLOW = [
  "0. Never read autocalc's source. Read the schema resources (autocalc://schema/index, autocalc://schema/<service>) for legal options and ranges. For a reviewable quote, write a YAML file and call plan_quote(path), then apply_quote(path).",
  "1. Collect requirements: services, region (friendly names ok), billing mode(s), quantities and sizes.",
  "2. Or call draft_quote(customer, requirements); exact matches are confirmed automatically.",
  "3. Show the candidates of every pending requirement, let the user choose, call revise_quote.",
  "4. Show the chosen specs and prices; when the user agrees, call publish_quote and reply with the share link and a table.",
  "5. Units: sizes in GB, bandwidth in Mbit/s, 730 h = one month. Use compare_modes for PPU/monthly/yearly.",
].join("\n");

export async function main(): Promise<void> {
  const core = createCore();
  const server = new McpServer({ name: "autocalc", version: pkg.version });
  const invoke = async (name: string, input: unknown, signal: AbortSignal) => {
    try { return { content: [{ type: "text" as const, text: JSON.stringify(withNotice(await core.invoke(name, input, { signal }))) }] }; }
    catch (error) { const norm = normalizeError(error); return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(norm.toJSON()) }] }; }
  };
  for (const [name, entry] of Object.entries(registry)) {
    server.registerTool(name, { description: entry.description, inputSchema: entry.schema, annotations: entry.annotations }, async () => { throw new Error("unreachable: calls are dispatched by the CallTool handler below"); });
  }
  // The SDK's tool wrapper validates before invoking the handler and renders
  // input failures as plain text. Dispatch calls through the shared validator
  // so domain errors have the same structured shape as other action failures.
  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const name = request.params.name;
    if (!Object.hasOwn(registry, name)) throw new McpError(ErrorCode.InvalidParams, `Unknown tool ${name}`);
    return invoke(name, request.params.arguments ?? {}, extra.signal);
  });
  server.registerResource("schema_index", "autocalc://schema/index", { description: "Every service schema with its frontend version and how much of it is mapped.", mimeType: "application/json" },
    async uri => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: await schemaIndex() }] }));
  server.registerResource("schema", new ResourceTemplate("autocalc://schema/{service}", { list: undefined }), { description: "One service's card schema: controls, option names, order, ranges. Needs no login and no browser.", mimeType: "application/yaml" },
    async (uri, { service }) => ({ contents: [{ uri: uri.href, mimeType: "application/yaml", text: await schemaOf(String(service)) }] }));
  server.registerPrompt("quote_workflow", { description: "Standard workflow for turning a request into a shareable Huawei Cloud quote" }, () => ({ messages: [{ role: "user", content: { type: "text", text: QUOTE_WORKFLOW } }] }));
  const transport = new StdioServerTransport();
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => { await server.close(); await core.close(); })();
  server.server.onclose = () => { void core.close(); };
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) process.once(signal, () => { void close().finally(() => { process.exitCode = code; }); });
  await server.connect(transport);
}
if (import.meta.main) await main();
