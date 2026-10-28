import { describe, expect, test } from "bun:test";
import { request, chromium } from "playwright";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

describe("runtime compatibility", () => {
  test("creates and disposes an API request context", async () => {
    const context = await request.newContext();
    await context.dispose();
  });

  test("launches and closes headless Chromium", async () => {
    const browser = await chromium.launch({ headless: true });
    expect(browser.isConnected()).toBe(true);
    await browser.close();
  });

  test("exposes a meaningful numeric input schema through MCP", async () => {
    const server = new McpServer({ name: "runtime-test", version: "1" });
    const numeric = z.union([z.number().positive(), z.string().regex(/^\d+(?:\.\d+)?$/)])
      .pipe(z.coerce.number<string | number>().positive()).describe("Positive quantity");
    server.registerTool("probe", { inputSchema: { quantity: numeric } }, async ({ quantity }) => ({
      content: [{ type: "text", text: String(quantity) }],
    }));
    const client = new Client({ name: "runtime-test-client", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const result = await client.listTools();
      const properties = result.tools[0]?.inputSchema.properties;
      expect(properties?.quantity).toBeDefined();
      expect(JSON.stringify(properties?.quantity)).toContain("number");
      expect(JSON.stringify(properties?.quantity)).toContain("string");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
