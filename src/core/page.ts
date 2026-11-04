import { BrowserManager } from "./browser.ts";
import { endpoints, shareLink } from "./endpoints.ts";
import { CalculatorError } from "./errors.ts";
import { ListReference } from "./schemas.ts";
export async function renderCheck(manager: BrowserManager, reference: string, options: { pageUrl?: string; detailUrl?: string; timeout?: number } = {}) {
  const id = ListReference.parse(reference), detail = new URL(options.detailUrl ?? endpoints.detail(id));
  return manager.withAnonymousContext(async context => {
    const page = await context.newPage();
    const responsePromise = page.waitForResponse(response => { const url = new URL(response.url()); return url.origin === detail.origin && url.pathname === detail.pathname && url.searchParams.get("key") === id; }, { timeout: options.timeout ?? 60000 });
    void responsePromise.catch(() => undefined);
    try {
      await page.goto(options.pageUrl ?? shareLink(id), { waitUntil: "domcontentloaded", timeout: options.timeout ?? 60000 });
      const response = await responsePromise;
      if (!response.ok()) throw new CalculatorError("UPSTREAM", `Share detail returned HTTP ${response.status()}`);
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || String((data as Record<string, unknown>).retCode) !== "200") throw new CalculatorError("UNEXPECTED_RESPONSE", "Share detail did not succeed");
      await page.waitForFunction(() => !!document.body?.innerText.trim(), undefined, { timeout: options.timeout ?? 60000 });
      const text = await page.locator("body").innerText();
      return { ok: true, view_details: /view details/i.test(text), amounts: text.match(/\$[\d,]+\.\d{2}/g) ?? [] };
    } finally { await page.close(); }
  });
}
