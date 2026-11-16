import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("MCP starts over stdio and exposes ergonomic agent-first schemas", async () => {
  const client = new Client({ name: "autocalc-test", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["run", "src/mcp.ts"], stderr: "pipe" });
  await client.connect(transport);
  try {
    const tools = (await client.listTools()).tools;
    expect(tools).toHaveLength(23);
    const names = tools.map(tool => tool.name);
    expect(names).toEqual(expect.arrayContaining(["plan_quote", "apply_quote", "read_price_list", "list_services", "list_regions", "inspect_draft"]));
    expect(names).not.toContain("compile_quote");
    expect(names).not.toContain("supported_services");
    expect(names).not.toContain("list_drafts");

    const search = tools.find(tool => tool.name === "search_skus");
    const limit = search?.inputSchema.properties?.limit;
    expect(JSON.stringify(limit)).toContain("integer");
    expect(JSON.stringify(limit)).not.toContain("string");
    expect(JSON.stringify(limit)).not.toContain("anyOf");

    expect(tools.find(t => t.name === "describe_service")?.inputSchema.required).toContain("region");
    expect(tools.find(t => t.name === "compare_modes")?.inputSchema.required).toContain("region");
    expect(tools.find(t => t.name === "auth_login")?.inputSchema.properties).not.toHaveProperty("timeout");

    const quoteItemProps = (tools.find(t => t.name === "quote")?.inputSchema.properties?.items as { items?: { properties?: Record<string, unknown> } })?.items?.properties;
    expect(quoteItemProps).not.toHaveProperty("size_measure_id");
    expect(quoteItemProps).not.toHaveProperty("usage_measure_id");

    const reqProps = (tools.find(t => t.name === "draft_quote")?.inputSchema.properties?.requirements as { items?: { properties?: Record<string, { enum?: string[] }> } })?.items?.properties;
    expect(reqProps?.billing?.enum).toEqual(["ondemand", "monthly", "yearly", "ri"]);
    expect(reqProps).not.toHaveProperty("az");

    for (const tool of tools) {
      for (const property of Object.values(tool.inputSchema.properties ?? {})) {
        expect((property as { description?: string }).description).toBeTruthy();
      }
    }
    expect((await client.listPrompts()).prompts.map(prompt => prompt.name)).toContain("quote_workflow");
    const instructions = client.getInstructions() ?? "";
    for (const key of ["plan_quote", "apply_quote", 'version: "1"', "autocalc://schema/index", "auth_login"]) {
      expect(instructions).toContain(key);
    }
  } finally {
    await client.close();
  }
});

test("CLI supported and MCP list_services(publishable_only) agree, and prompt prioritizes YAML", async () => {
  const client = new Client({ name: "autocalc-parity", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["run", "src/mcp.ts"], stderr: "pipe" }));
  try {
    const call = await client.callTool({ name: "list_services", arguments: { publishable_only: true } });
    expect(call.isError).not.toBe(true);
    const content = call.content as Array<{ type: string; text?: string }>;
    const mcp = JSON.parse(content.find(item => item.type === "text")?.text ?? "null") as Array<{ service: string; modes: string[]; options: string[] }>;
    const proc = Bun.spawn([globalThis.process.execPath, "run", "src/cli.ts", "supported", "--json"], { stdout: "pipe", stderr: "pipe" });
    const [output, exit] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    expect(exit).toBe(0);
    const cliPublishable = (JSON.parse(output) as Array<{ publication_supported: boolean; service: string; modes: string[]; options: string[] }>)
      .filter(row => row.publication_supported)
      .map(({ service, modes, options }) => ({ service, modes, options }));
    expect(mcp.map(({ service, modes, options }) => ({ service, modes, options }))).toEqual(cliPublishable);

    const prompt = await client.getPrompt({ name: "quote_workflow" });
    expect(prompt.messages.length).toBeGreaterThan(0);
    const promptText = JSON.stringify(prompt.messages);
    for (const step of ["autocalc://schema/index", "plan_quote", "apply_quote", "compare_modes", "730"]) expect(promptText).toContain(step);
    expect(promptText).not.toContain("create_price_list");
    expect(promptText).not.toContain("Never read autocalc's source");
  } finally {
    await client.close();
  }
}, 60000);

test("schema resources list services and read projected agent schema without login", async () => {
  const client = new Client({ name: "autocalc-schema", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["run", "src/mcp.ts"], stderr: "pipe" }));
  try {
    const index = JSON.parse(((await client.readResource({ uri: "autocalc://schema/index" })).contents[0] as { text: string }).text) as Array<{ service: string; publishable: boolean; mapped_percent: number }>;
    const ecsRow = index.find(row => row.service === "ecs");
    expect(ecsRow?.mapped_percent).toBeGreaterThan(0);
    expect(ecsRow?.publishable).toBe(true);

    const ecsSchema = ((await client.readResource({ uri: "autocalc://schema/ecs" })).contents[0] as { text: string }).text;
    expect(ecsSchema).toContain("service: ecs");
    expect(ecsSchema).toContain("legal_options:");
    expect(ecsSchema).not.toContain("option_key:");
    expect(ecsSchema).not.toContain("value_type:");

    let errTraversal: Error | undefined;
    try {
      await client.readResource({ uri: "autocalc://schema/..%2Fx" });
    } catch (e) {
      errTraversal = e as Error;
    }
    expect(errTraversal).toBeDefined();

    let errMissing: Error | undefined;
    try {
      await client.readResource({ uri: "autocalc://schema/nope" });
    } catch (e) {
      errMissing = e as Error;
    }
    expect(errMissing?.message).toMatch(/No schema/);
  } finally {
    await client.close();
  }
}, 60000);

test("invalid tool input returns flattened validation errors with hints, and inspect_draft lists without draft_id", async () => {
  const client = new Client({ name: "autocalc-error-parity", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["run", "src/mcp.ts"], stderr: "pipe" }));
  try {
    const result = await client.callTool({ name: "read_price_list", arguments: { url_or_id: "not-a-share-id" } });
    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "null") as { error: string; message: string; hint?: string; details?: { issues?: Array<{ path: string; message: string }> } };
    expect(payload).toMatchObject({ error: "VALIDATION", details: { issues: [{ path: "url_or_id" }] } });
    expect(payload.message).toContain("url_or_id");
    expect(payload.hint).toBeTruthy();

    const badQuote = await client.callTool({ name: "quote", arguments: { region: "sa-brazil-1", items: [{ service: "ecs", spec: "x", quantity: "bad" }] } });
    expect(badQuote.isError).toBe(true);
    const badQuotePayload = JSON.parse((badQuote.content as Array<{ type: string; text?: string }>)[0]?.text ?? "null") as { error: string; message: string; details?: { issues?: Array<{ path: string }> } };
    expect(badQuotePayload.error).toBe("VALIDATION");
    expect(badQuotePayload.message).toContain("items.0.quantity");
    expect(badQuotePayload.message).not.toBe("Invalid action input.");

    const drafts = await client.callTool({ name: "inspect_draft", arguments: {} });
    expect(drafts.isError).not.toBe(true);
    const draftsPayload = JSON.parse((drafts.content as Array<{ type: string; text?: string }>)[0]?.text ?? "null") as { total: number; drafts: unknown[] };
    expect(typeof draftsPayload.total).toBe("number");
    expect(Array.isArray(draftsPayload.drafts)).toBe(true);

    let errNoSuchTool: { code?: number } | undefined;
    try {
      await client.callTool({ name: "no_such_tool", arguments: {} });
    } catch (e) {
      errNoSuchTool = e as { code?: number };
    }
    expect(errNoSuchTool?.code).toBe(-32602);
  } finally {
    await client.close();
  }
}, 60000);
