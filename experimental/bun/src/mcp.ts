#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { createCore, CalculatorError } from "./core/index.ts";
import { registry } from "./core/registry.ts";

export async function main(): Promise<void> {
  const core = createCore();
  const server = new McpServer({ name: "autocalc", version: "0.1.0" });
  const invoke = async (name: string, input: unknown, signal: AbortSignal) => {
    try { return { content: [{ type: "text" as const, text: JSON.stringify(await core.invoke(name, input, { signal })) }] }; }
    catch (error) { return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(error instanceof CalculatorError ? error.toJSON() : { error: "AUTOCALC", message: "Unexpected error" }) }] }; }
  };
  for (const [name, entry] of Object.entries(registry)) {
    server.registerTool(name, { description: entry.description, inputSchema: entry.schema, annotations: entry.annotations }, (input: unknown, extra: { signal: AbortSignal }) => invoke(name, input, extra.signal));
  }
  // The SDK's tool wrapper validates before invoking the handler and renders
  // input failures as plain text. Dispatch calls through the shared validator
  // so domain errors have the same structured shape as other action failures.
  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const name = request.params.name;
    if (!Object.hasOwn(registry, name)) throw new McpError(ErrorCode.InvalidParams, `Unknown tool ${name}`);
    return invoke(name, request.params.arguments ?? {}, extra.signal);
  });
  server.registerPrompt("quote_workflow", { description: "Guide a Huawei Cloud quotation from requirements to a saved list" }, () => ({ messages: [{ role: "user", content: { type: "text", text: "1. Collect requirements: services, region (friendly names ok), billing mode(s), quantities and sizes.\n2. Call describe_service(service, region) to see valid options; search_skus to pick specs.\n3. Call create_price_list(name, items, dry_run=True) and show the totals and warnings.\n4. When the user agrees, call create_price_list(dry_run=False) and reply with the share link and a table.\n5. Units: sizes in GB, bandwidth in Mbit/s, 730 h = one month. Use compare_modes for PPU/monthly/yearly." } }] }));
  const transport = new StdioServerTransport();
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => { await server.close(); await core.close(); })();
  server.server.onclose = () => { void core.close(); };
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) process.once(signal, () => { void close().finally(() => { process.exitCode = code; }); });
  await server.connect(transport);
}
if (import.meta.main) await main();
