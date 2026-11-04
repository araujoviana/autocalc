import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
test("MCP starts over stdio and lists shared actions", async () => {
  const client = new Client({ name: "autocalc-test", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["run", "src/mcp.ts"], stderr: "pipe" });
  await client.connect(transport);
  try {
    const tools = (await client.listTools()).tools;
    expect(tools).toHaveLength(26);
    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining(["compile_quote", "read_price_list", "list_services", "list_regions"]));
    const search = tools.find(tool => tool.name === "search_skus");
    const limit = search?.inputSchema.properties?.limit;
    expect(JSON.stringify(limit)).toContain("number");
    expect(JSON.stringify(limit)).toContain("string");
    for (const tool of tools) for (const property of Object.values(tool.inputSchema.properties ?? {})) expect((property as { description?: string }).description).toBeTruthy();
    expect((await client.listPrompts()).prompts.map(prompt => prompt.name)).toContain("quote_workflow");
  }
  finally { await client.close(); }
});

test("CLI and MCP return the same supported services", async () => {
  const client = new Client({ name: "autocalc-parity", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["run", "src/mcp.ts"], stderr: "pipe" }));
  try {
    const call = await client.callTool({ name: "supported_services", arguments: {} });
    expect(call.isError).not.toBe(true);
    const content = call.content as Array<{ type: string; text?: string }>;
    const mcp = JSON.parse(content.find(item => item.type === "text")?.text ?? "null") as unknown;
    const process = Bun.spawn([globalThis.process.execPath, "run", "src/cli.ts", "supported", "--json"], { stdout: "pipe", stderr: "pipe" });
    const [output, exit] = await Promise.all([new Response(process.stdout).text(), process.exited]);
    expect(exit).toBe(0);
    expect(JSON.parse(output)).toEqual(mcp);
    const prompt = await client.getPrompt({ name: "quote_workflow" });
    expect(prompt.messages.length).toBeGreaterThan(0);
    const promptText = JSON.stringify(prompt.messages);
    for (const step of ["autocalc://schema/index", "draft_quote", "revise_quote", "publish_quote", "compare_modes", "730"]) expect(promptText).toContain(step);
    expect(promptText).not.toContain("create_price_list");
  } finally { await client.close(); }
}, 15000);

test("schema resources list services and read one without login", async () => {
  const client = new Client({ name: "autocalc-schema", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["run", "src/mcp.ts"], stderr: "pipe" }));
  try {
    const index = JSON.parse(((await client.readResource({ uri: "autocalc://schema/index" })).contents[0] as { text: string }).text) as Array<{ service: string; mapped_percent: number }>;
    expect(index.find(row => row.service === "ecs")?.mapped_percent).toBeGreaterThan(0);
    expect(((await client.readResource({ uri: "autocalc://schema/ecs" })).contents[0] as { text: string }).text).toContain("service: ecs");
    await expect(client.readResource({ uri: "autocalc://schema/..%2Fx" })).rejects.toThrow();
    await expect(client.readResource({ uri: "autocalc://schema/nope" })).rejects.toThrow(/No schema/);
  } finally { await client.close(); }
}, 15000);

test("invalid tool input returns a structured validation error", async () => {
  const client = new Client({ name: "autocalc-error-parity", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["run", "src/mcp.ts"], stderr: "pipe" }));
  try {
    const result = await client.callTool({ name: "read_price_list", arguments: { url_or_id: "not-a-share-id" } });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(JSON.parse(content[0]?.text ?? "null")).toMatchObject({ error: "VALIDATION" });
    await expect(client.callTool({ name: "no_such_tool", arguments: {} })).rejects.toMatchObject({ code: -32602 });
  } finally { await client.close(); }
});
