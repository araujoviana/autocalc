import { expect, test } from "bun:test";
import { BrowserManager } from "../../src/core/browser.ts";
import { renderCheck } from "../../src/core/page.ts";
test("render readiness requires a matching share detail response and nonempty body", async () => {
  const server = Bun.serve({ port: 0, fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/detail") return Response.json({ retCode: 200, data: {} });
    return new Response(`<body>View Details $1.00<script>fetch('/detail?key=other');fetch('/detail?key=abc123')</script></body>`, { headers: { "content-type": "text/html" } });
  } });
  const manager = new BrowserManager();
  try {
    const result = await renderCheck(manager, "abc123", { pageUrl: new URL("/", server.url).href, detailUrl: new URL("/detail", server.url).href, timeout: 5000 });
    expect(result).toMatchObject({ ok: true, view_details: true });
  } finally { await manager.close(); server.stop(); }
});
