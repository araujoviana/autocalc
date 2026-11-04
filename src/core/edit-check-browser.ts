import type { BrowserManager } from "./browser.ts";
import { judge } from "./edit-check.ts";
import { PAGE, RATE } from "./endpoints.ts";

type Dict = Record<string, unknown>;
const obj = (value: unknown): Dict => value && typeof value === "object" && !Array.isArray(value) ? value as Dict : {};
export async function editCheckCard(manager: BrowserManager, index: number, card: Dict, options: { pageUrl?: string; rateUrl?: string; timeout?: number; screenshotPath?: string; signal?: AbortSignal } = {}) {
  const selected = obj(card.selectedProduct), title = String(selected._customTitle ?? selected.serviceCode ?? `card ${index}`), stored = typeof selected.amount === "number" && Number.isFinite(selected.amount) ? selected.amount : null;
  const unavailable = (reason: string) => ({ index, title, status: "unavailable" as const, stored, edit: null, delta: null, added: [], removed: [], reason });
  if (selected.serviceCode !== "ecs" && selected.serviceCode !== "obs") return unavailable("Edit verification is only supported for ECS and OBS");
  if (options.signal?.aborted) return unavailable("Edit check cancelled");
  let failureReason = "Browser Edit check could not be completed";
  try {
    return await manager.withAnonymousContext(async context => {
      const page = await context.newPage(), timeout = options.timeout ?? 30000, navigationTimeout = options.timeout ?? 60000, base = options.pageUrl ?? PAGE;
      const overallDeadline = Date.now() + (options.timeout === undefined ? 120000 : options.timeout * 4);
      const remaining = (maximum: number) => Math.max(1, Math.min(maximum, overallDeadline - Date.now()));
      const cancel = () => { void page.close().catch(() => undefined); };
      options.signal?.addEventListener("abort", cancel, { once: true });
      if (options.signal?.aborted) cancel();
      try {
      await page.goto(base, { waitUntil: "domcontentloaded", timeout: remaining(navigationTimeout) });
      failureReason = "Calculator stores did not become ready";
      await page.waitForFunction(() => {
        const app = document.querySelector("#app") as (Element & { __vue_app__?: { config?: { globalProperties?: { $pinia?: { _s?: Map<string, unknown> } } } } }) | null;
        const stores = app?.__vue_app__?.config?.globalProperties?.$pinia?._s;
        return !!stores?.get("cartInfo") && !!stores.get("globalInfo");
      }, undefined, { timeout: remaining(timeout) });
      failureReason = "Could not initialize the calculator cart";
      await page.evaluate(async (savedCard: Dict) => {
        const app = document.querySelector("#app") as Element & { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, any> } } } } };
        const stores = app.__vue_app__.config.globalProperties.$pinia._s, cart = stores.get("cartInfo"), global = stores.get("globalInfo");
        if (typeof cart?.MODIFY_CARTLISTDATABASE !== "function") throw new Error("Cart initialization is unavailable");
        cart.MODIFY_CARTLISTDATABASE({ action: "init", originData: [savedCard], monthModeTag: false, currencyData: global.currencyData, currentCurrency: "USD" });
        const value = { cartListDataBase: JSON.parse(JSON.stringify(cart.cartListDataBase)), totalCartPrice: JSON.parse(JSON.stringify(cart.totalCartPrice)), cartTitleIndex: { ecs: 1 }, isEditingShareList: false, monthModeTag: false };
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("keyval-store");
          request.onerror = () => reject(new Error("IndexedDB unavailable"));
          request.onsuccess = () => { const db = request.result; if (!db.objectStoreNames.contains("keyval")) { db.close(); reject(new Error("IndexedDB store unavailable")); return; } const tx = db.transaction("keyval", "readwrite"); tx.objectStore("keyval").put({ value, expire: null }, "tempShareList"); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(new Error("IndexedDB write failed")); }; };
        });
      }, card);
      failureReason = "Could not open the calculator Edit page";
      const target = new URL(base); target.searchParams.set("tempShareList", "true"); target.hash = `/${String(selected.serviceCode)}`;
      await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: remaining(navigationTimeout) });
      const guideClose = page.locator('.guide-dialog button[aria-label="Close"]').first();
      if (await guideClose.isVisible().catch(() => false)) await guideClose.click({ timeout: 800 }).catch(() => undefined);
      for (const text of [/^(OK|Accept)$/]) { const button = page.getByRole("button", { name: text }).first(); if (await button.isVisible().catch(() => false)) await button.click({ timeout: 800 }).catch(() => undefined); }
      const blockers = page.locator(".guide-dialog, .tiny-dialog-box__wrapper, .v-modal, .privacy-popup");
      for (const blocker of await blockers.all()) if (await blocker.isVisible().catch(() => false)) return unavailable("A calculator dialog blocks Edit");
      const observed: Array<{ request: Dict; body: Dict }> = [];
      const pending = new Set<Promise<void>>();
      const active = new Set<import("playwright").Request>();
      const storedProducts = (Array.isArray(selected.productAllInfos) ? selected.productAllInfos : []).map(obj);
      const anchor = storedProducts.find(item => typeof item.resourceType === "string" && (selected.serviceCode === "obs" || item.resourceType.split(".").at(-1) === "vm") && typeof item.resourceSpecCode === "string" && !!item.resourceSpecCode);
      if (!anchor) return unavailable("Stored card has no product line to correlate");
      let changed = Date.now();
      const matches = (request: import("playwright").Request): Dict | undefined => {
        if (request.url().split("?")[0] !== (options.rateUrl ?? RATE)) return undefined;
        let body: Dict; try { body = obj(request.postDataJSON()); } catch { return undefined; }
        if (body.regionId !== selected.region || !Array.isArray(body.productInfos) || !body.productInfos.some(line => obj(line).resourceType === anchor.resourceType && obj(line).resourceSpecCode === anchor.resourceSpecCode && (selected.serviceCode !== "obs" || obj(line).usageFactor === anchor.usageFactor))) return undefined;
        return body;
      };
      const onRequest = (request: import("playwright").Request) => { if (matches(request)) { active.add(request); changed = Date.now(); } };
      const onFailed = (request: import("playwright").Request) => { if (active.delete(request)) changed = Date.now(); };
      const listener = (response: import("playwright").Response) => {
        const request = matches(response.request());
        if (!request) return;
        active.delete(response.request());
        changed = Date.now();
        const work = (async () => { const body = obj(await response.json()); if (response.ok()) observed.push({ request, body }); changed = Date.now(); })().catch(() => undefined).finally(() => { pending.delete(work); });
        pending.add(work);
      };
      page.on("request", onRequest); page.on("requestfailed", onFailed);
      page.on("response", listener);
      try {
        failureReason = "Could not open the saved card for Edit";
        const editButton = page.locator("button.collapse-card-item-header-operation-item").filter({ hasText: /^Edit$/ }).first();
        const clickDeadline = Math.min(overallDeadline, Date.now() + timeout);
        let clicked = false;
        while (!clicked && Date.now() < clickDeadline && !options.signal?.aborted) {
          const guide = page.locator(".guide-dialog, .tiny-dialog-box__wrapper").filter({ hasText: "Featured Products All in One Place" }).first();
          if (await guide.isVisible().catch(() => false)) await guide.getByRole("button", { name: "Close" }).first().click({ timeout: remaining(800) }).catch(() => undefined);
          try { await editButton.click({ timeout: Math.max(1, Math.min(600, clickDeadline - Date.now())) }); clicked = true; }
          catch { /* The guide may appear while Playwright is waiting to click. */ }
        }
        const hiddenCart = page.locator(".tab-cart-small");
        if (!clicked && await hiddenCart.count() === 1 && !(await hiddenCart.isVisible()) && await editButton.count() === 1 && !(await editButton.isVisible())) {
          await editButton.dispatchEvent("click"); clicked = true;
        }
        if (!clicked) return unavailable("Could not open the saved card for Edit");
        const deadline = Math.min(overallDeadline, Date.now() + timeout);
        while (Date.now() < deadline && !options.signal?.aborted) { if (observed.length && !active.size && !pending.size && Date.now() - changed >= 500) break; await new Promise(resolve => setTimeout(resolve, 50)); }
        if (options.signal?.aborted) return unavailable("Edit check cancelled");
        const last = observed.at(-1);
        if (!last || active.size || pending.size || Date.now() - changed < 500) return unavailable("Rating responses did not settle");
        const warnings = await page.getByText("No data matched", { exact: false }).first().isVisible().catch(() => false) ? ["Calculator reported: No data matched"] : [];
        const result = judge(index, card, last.request, last.body.amount);
        if (selected.serviceCode === "obs" && warnings.length && result.status === "ok") return { ...result, status: "mismatch" as const, reason: "No data matched during OBS Edit; the calculator may have dropped stored configuration", warnings };
        return { ...result, warnings };
      } finally { page.off("request", onRequest); page.off("requestfailed", onFailed); page.off("response", listener); }
      } finally {
        if (options.screenshotPath) await page.screenshot({ path: options.screenshotPath }).catch(() => undefined);
        if (!page.isClosed()) {
          const button = page.getByRole("button", { name: "Cancel", exact: true }).first();
          if (await button.isVisible().catch(() => false)) await button.click({ timeout: 800 }).catch(() => undefined);
          else await page.keyboard.press("Escape").catch(() => undefined);
        }
        options.signal?.removeEventListener("abort", cancel);
      }
    });
  } catch { return unavailable(options.signal?.aborted ? "Edit check cancelled" : failureReason); }
}
