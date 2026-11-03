import { expect, test } from "bun:test";
import { Driver, type PageLike } from "../../src/core/page/driver.ts";
import { checkCard } from "../../src/core/page/edit.ts";
import { SCRIPT } from "../../src/core/page/store.ts";
import { cents, formatCents } from "../../src/core/quote/decimal.ts";

type Dict = Record<string, any>;
const KEY = "CARDKEY";
const STORED_FORM = { template_RENDER: { size: 100 } };
const card = (): Dict => ({ rewriteValue: STORED_FORM, selectedProduct: { amount: 10.48, _cartId: KEY, serviceCode: "ecs" } });

/** A page whose Edit/Save/Cancel buttons move a tiny state machine; `scenario` bends it. */
class EditFake {
  now = 0; stage: "list" | "editing" | "saved" = "list"; clicks: string[] = []; handlers: Record<string, Array<(arg: unknown) => void>> = {};
  constructor(readonly scenario: { inCart?: boolean; editOpens?: boolean; current?: Dict | null; saveAmount?: number; products?: unknown[]; saveWorks?: boolean; warning?: boolean } = {}) { this.warningOpen = !!scenario.warning; }
  on(event: string, listener: (arg: any) => void) { (this.handlers[event] ??= []).push(listener); }
  async evaluate(script: string, arg?: { fn: string; args: unknown[] }) {
    if (!arg) return undefined;
    expect(script).toBe(SCRIPT);
    const s = this.scenario;
    switch (arg.fn) {
      case "removeOverlays": return true;
      case "cartSummary": return s.inCart === false ? null : { timeTag: this.stage === "saved" ? 2 : 1, amount: this.stage === "saved" ? s.saveAmount ?? 10.48 : 10.48 };
      case "tagCard": return true;
      case "editState": return this.stage === "editing" && s.editOpens !== false ? { cartId: KEY, current: s.current === undefined ? STORED_FORM : s.current } : {};
      case "cartItem": return { selectedProduct: { productAllInfos: s.products ?? [{ inquiryResult: { amount: 10.48 } }] } };
      default: return undefined;
    }
  }
  async waitForTimeout(ms: number) { this.now += ms / 1000; }
  async goto() {}
  async click() {}
  keyboard = { press: async () => {} }; warningOpen = false;
  locator(selector: string, options?: { hasText?: string }) {
    const page = this, label = options?.hasText;
    const box = {
      first: () => box,
      isVisible: async () => selector === "[closeactionname=rewriteError_close]" && page.warningOpen,
      isDisabled: async () => false,
      click: async () => {
        if (selector.includes("headerbtn")) page.warningOpen = false;
        if (!label) return;
        if (label === "Save" && page.scenario.saveWorks === false) throw new Error("not clickable");
        page.clicks.push(label);
        if (label === "Edit") page.stage = "editing";
        if (label === "Save") page.stage = "saved";
        if (label === "Cancel") page.stage = "list";
      },
    };
    return box;
  }
}
const run = (scenario: ConstructorParameters<typeof EditFake>[0]) => {
  const page = new EditFake(scenario), driver = new Driver(page as unknown as PageLike, "shared-list", { timeout: 5, quiet: 1.5, clock: () => page.now });
  return checkCard(driver, 0, card()).then(result => ({ result, page, driver }));
};

test("a card whose Edit price equals the stored price passes", async () => {
  const { result, page, driver } = await run({});
  expect(result).toMatchObject({ index: 0, equal: true, reason: undefined, warning: false });
  expect(formatCents(result.edit!)).toBe("10.48");
  expect(page.clicks).toEqual(["Edit", "Save"]);
  expect(driver.service).toBe("ecs");
});

test("a different Edit price is a mismatch carrying both amounts", async () => {
  const { result } = await run({ saveAmount: 9.83 });
  expect(result.equal).toBe(false);
  expect(formatCents(result.edit!)).toBe("9.83");
  expect(formatCents(result.stored)).toBe("10.48");
});

test("a card missing from the page's list is reported without trying Edit", async () => {
  const { result, page } = await run({ inCart: false });
  expect(result.reason).toBe("the card is not in the page's price list after View Details");
  expect(page.clicks).toEqual([]);
});

test("an Edit view that never opens cancels out of edit mode", async () => {
  const { result, page } = await run({ editOpens: false });
  expect(result.reason).toBe("the Edit view did not open");
  expect(page.clicks).toEqual(["Edit", "Cancel"]);
});

test("a form that never matches the stored state names the differing fields", async () => {
  const { result } = await run({ current: { template_RENDER: { size: 7 } } });
  expect(result.equal).toBe(false);
  expect(result.reason).toContain("the form state differs after Edit: ");
  expect(result.reason).toContain("size");
});

test("a Save button that never responds fails the card and leaves edit mode", async () => {
  const { result, page } = await run({ saveWorks: false });
  expect(result.reason).toBe("the Save button did not respond");
  expect(page.clicks.at(-1)).toBe("Cancel");
});

test("a re-priced card with unpriced or no products fails even when the amounts are equal", async () => {
  for (const products of [[{ inquiryResult: { amount: 10.48 } }, {}], []]) {
    const { result } = await run({ products });
    expect(result).toMatchObject({ equal: false, reason: "the re-priced card has unpriced products", edit: null });
  }
});

test("cents of the stored amount is what a result carries", async () => {
  expect((await run({})).result.stored).toEqual(cents(10.48));
});

test("a shared list that does not open fails every card with the open reason and never throws", async () => {
  const { editCheck } = await import("../../src/core/page/edit.ts");
  const reader = { getUncached: async () => ({ retCode: "200", data: { cartListData: [card(), card()] } }) };
  const page = { on() {}, goto: async () => { throw new Error("net::ERR"); }, evaluate: async () => undefined, waitForTimeout: async () => {}, locator: () => ({}) };
  const manager = { withAnonymousContext: async (operation: (context: unknown) => Promise<unknown>) => operation({ newPage: async () => page }) };
  const results = await editCheck(reader, manager as never, "abc1", { driver: { timeout: 0.01 } });
  expect(results.map(result => [result.index, result.equal, result.reason])).toEqual([[0, false, "The calculator page did not load."], [1, false, "The calculator page did not load."]]);
});

test("the page's warning dialog alone does not fail a card; it is reported and closed", async () => {
  const { result, page } = await run({ warning: true });
  expect(result).toMatchObject({ equal: true, warning: true });
  expect(page.warningOpen).toBe(false);
});
