import { expect, test } from "bun:test";
import { createCore } from "../../src/core/index.ts";

const live = process.env.AUTOCALC_LIVE === "1";
test.skipIf(!live)("public catalog and rating are available", async () => {
  const core = createCore();
  try {
    const services = await core.invoke("list_services", {});
    expect(Array.isArray(services)).toBe(true);
    const names = (services as Array<{ service: string }>).map(item => item.service);
    for (const name of ["ecs", "rds", "obs", "cce", "evs"]) expect(names).toContain(name);
    const regions = await core.invoke("list_regions", { region: "Santiago" });
    expect(regions).toMatchObject({ resolved: "la-south-2" });
    const result = await core.invoke("quote", { region: "Santiago", billing: "monthly", items: [{ service: "ecs", spec: "c7n.large.2.linux" }] });
    expect((result as { total: number }).total).toBeGreaterThan(0);
  } finally { await core.close(); }
}, 60000);

test.skipIf(!live)("MCP quotes the live catalog through stdio", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const client = new Client({ name: "autocalc-live-check", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["run", "src/mcp.ts"], stderr: "pipe" }));
  try {
    const response = await client.callTool({ name: "quote", arguments: { region: "Santiago", billing: "monthly", items: [{ service: "ecs", spec: "c7n.large.2.linux" }] } });
    expect(response.isError).not.toBe(true);
    const content = response.content as Array<{ type: string; text?: string }>;
    const quote = JSON.parse(content.find(item => item.type === "text")?.text ?? "null") as { total: number; region: string };
    expect(quote.region).toBe("la-south-2");
    expect(quote.total).toBeGreaterThan(0);
  } finally { await client.close(); }
}, 60000);
