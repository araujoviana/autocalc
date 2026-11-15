import { expect, test } from "bun:test";
import { Driver, type PageLike } from "../../src/core/page/driver.ts";
import { checkCard, editCheck, editWorkers } from "../../src/core/page/edit.ts";
import { INSTALL_SCRIPT, SCRIPT } from "../../src/core/page/store.ts";
import { publishChecked, verify } from "../../src/core/gate.ts";
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

test("a page that will not open is tried twice, and only that; the second attempt's result is returned", async () => {
  const { editCheck } = await import("../../src/core/page/edit.ts");
  const { CalculatorError } = await import("../../src/core/errors.ts");
  const reader = { getUncached: async () => ({ retCode: "200", data: { cartListData: [card()] } }) };
  const manager = { withAnonymousContext: async (operation: (context: unknown) => Promise<unknown>) => operation({ newPage: async () => ({ on() {}, evaluate: async () => undefined, getByRole: () => ({ click: async () => { throw new Error("no button"); } }) }) }) };
  let opens = 0;
  const makeDriver = () => ({ timeout: 0.01, open: async () => { opens += 1; if (opens === 1) throw new CalculatorError("PAGE_ENCODE_FAILED", "The calculator form did not appear."); }, settle: async () => {}, page: {} });
  const results = await editCheck(reader, manager as never, "abc1", { makeDriver: makeDriver as never });
  expect(opens).toBe(2);
  expect(results.map(result => result.reason)).toEqual(["the shared list did not open"]);
});

test("a page that never opens is retried once, not forever", async () => {
  const { editCheck } = await import("../../src/core/page/edit.ts");
  const { CalculatorError } = await import("../../src/core/errors.ts");
  const reader = { getUncached: async () => ({ retCode: "200", data: { cartListData: [card()] } }) };
  const manager = { withAnonymousContext: async (operation: (context: unknown) => Promise<unknown>) => operation({ newPage: async () => ({}) }) };
  let opens = 0;
  const makeDriver = () => ({ timeout: 0.01, open: async () => { opens += 1; throw new CalculatorError("PAGE_ENCODE_FAILED", "The calculator form did not appear."); }, page: {} });
  const results = await editCheck(reader, manager as never, "abc1", { makeDriver: makeDriver as never });
  expect(opens).toBe(2);
  expect(results[0]).toMatchObject({ equal: false, reason: "The calculator form did not appear." });
});

test("the page's warning dialog alone does not fail a card; it is reported and closed", async () => {
  const { result, page } = await run({ warning: true });
  expect(result).toMatchObject({ equal: true, warning: true });
  expect(page.warningOpen).toBe(false);
});

test("editWorkers respects budget cap and validates AUTOCALC_EDIT_WORKERS", () => {
  expect(editWorkers({}, 16 * 1024 ** 3, 8)).toBe(3);
  expect(editWorkers({}, 1024 ** 3, 8)).toBe(1);
  expect(editWorkers({}, 16 * 1024 ** 3, 2)).toBe(2);
  expect(editWorkers({ AUTOCALC_EDIT_WORKERS: "6" }, 1024 ** 3, 1)).toBe(6);
  for (const bad of ["0", "17", "x", "1.5", ""]) {
    expect(() => editWorkers({ AUTOCALC_EDIT_WORKERS: bad })).toThrow(/AUTOCALC_EDIT_WORKERS must be an integer from 1 to 16/);
  }
});

const evalPayload = (expr: string, arg?: { fn: string; args: unknown[] }) => {
  if (arg) return arg;
  const idx = expr.lastIndexOf(")(");
  if (idx === -1) return undefined;
  const raw = expr.slice(idx + 2, -1);
  return raw ? (JSON.parse(raw) as { fn: string; args: unknown[] }) : undefined;
};

test("editCheck parallelizes slices across isolated contexts and returns index-sorted results despite out-of-order completion", async () => {
  const cards = Array.from({ length: 6 }, (_, i) => ({
    rewriteValue: STORED_FORM,
    selectedProduct: { amount: 10 + i, _cartId: `K${i}`, serviceCode: "ecs" },
  }));
  const reader = { getUncached: async () => ({ retCode: "200", data: { cartListData: cards } }) };
  let active = 0;
  let maxActive = 0;
  let opens = 0;
  const pageFor = (sliceCards: Set<string>) => {
    const saved = new Set<string>();
    let editingKey = "";
    return {
      on() {},
      async evaluate(script: string, arg?: { fn: string; args: unknown[] }) {
        const p = evalPayload(script, arg);
        if (!p) return undefined;
        if (p.fn === "removeOverlays") return true;
        if (p.fn === "editState") return editingKey ? { cartId: editingKey, current: STORED_FORM } : {};
        const key = String(p.args[0] ?? "");
        const idx = Number(key.slice(1));
        if (p.fn === "tagCard") return sliceCards.has(key);
        if (p.fn === "cartSummary") return { timeTag: saved.has(key) ? 2 : 1, amount: 10 + idx };
        if (p.fn === "cartItem") return { selectedProduct: { productAllInfos: [{ inquiryResult: { amount: 10 + idx } }] } };
        return undefined;
      },
      getByRole: () => ({ click: async () => {} }),
      async waitForTimeout(ms: number) { await new Promise(r => setTimeout(r, ms)); },
      keyboard: { press: async () => {} },
      locator(selector: string, opts?: { hasText?: string }) {
        const box = {
          first: () => box,
          isVisible: async () => false,
          click: async () => {
            const match = /data-autocalc-card='([^']+)'/.exec(selector);
            if (!match) return;
            const key = match[1]!;
            if (opts?.hasText === "Edit") editingKey = key;
            if (opts?.hasText === "Save") {
              // Make earlier cards take slightly longer so later slices finish first.
              await new Promise(r => setTimeout(r, (6 - Number(key.slice(1))) * 4));
              saved.add(key);
              editingKey = "";
            }
            if (opts?.hasText === "Cancel") editingKey = "";
          },
        };
        return box;
      },
    };
  };
  const manager = {
    async withAnonymousContext<T>(op: (ctx: unknown) => Promise<T>): Promise<T> {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        return await op({ newPage: async () => pageFor(new Set(cards.map(c => c.selectedProduct._cartId))) });
      } finally {
        active -= 1;
      }
    },
  };
  const results = await editCheck(reader, manager as never, "abc101", {
    workers: 3,
    staggerMs: 0,
    makeDriver: (p, s, o) => {
      const drv = new Driver(p, s, { ...o, timeout: 1, quiet: 0, pollMs: 1 });
      (drv as unknown as { open: () => Promise<void>; settle: () => Promise<void> }).open = async () => { opens += 1; };
      (drv as unknown as { settle: () => Promise<void> }).settle = async () => {};
      return drv;
    },
  });
  expect(opens).toBe(3);
  expect(maxActive).toBe(3);
  expect(results.map(r => r.index)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(results.every((r, i) => r.equal && formatCents(r.edit!) === `${10 + i}.00`)).toBe(true);
});

test("editCheck retries only a failing slice on openFailed, never retries card mismatches, and preserves gate fail-closed deletion", async () => {
  const { CalculatorError } = await import("../../src/core/errors.ts");
  const cards = [0, 1, 2, 3].map(i => ({
    rewriteValue: STORED_FORM,
    selectedProduct: { amount: 10.48, _cartId: `C${i}`, serviceCode: "ecs" },
  }));
  const reader = { getUncached: async () => ({ retCode: "200", data: { cartListData: cards } }) };
  let openCalls = 0;
  let worker1FailsAlways = true;
  const makePage = (workerOpen: number) => {
    const saved = new Set<string>();
    let editingKey = "";
    return {
      on() {},
      async evaluate(s: string, arg?: { fn: string; args: unknown[] }) {
        const p = evalPayload(s, arg);
        if (!p) return undefined;
        if (p.fn === "removeOverlays") return true;
        if (p.fn === "editState") return editingKey ? { cartId: editingKey, current: STORED_FORM } : {};
        const key = String(p.args[0] ?? "");
        if (p.fn === "tagCard") return true;
        // Card C0 returns a price mismatch on worker 0; must never be retried.
        const outAmount = key === "C0" ? 9.99 : 10.48;
        if (p.fn === "cartSummary") return { timeTag: saved.has(key) ? 2 : 1, amount: saved.has(key) ? outAmount : 10.48 };
        if (p.fn === "cartItem") return { selectedProduct: { productAllInfos: [{ inquiryResult: { amount: outAmount } }] } };
        return undefined;
      },
      getByRole: () => ({
        click: async () => {
          if (workerOpen >= 1 && worker1FailsAlways) throw new CalculatorError("PAGE_ENCODE_FAILED", "transient slice 1 open failure");
        },
      }),
      async waitForTimeout() {},
      keyboard: { press: async () => {} },
      locator(selector: string, opts?: { hasText?: string }) {
        const box = {
          first: () => box,
          isVisible: async () => false,
          click: async () => {
            const match = /data-autocalc-card='([^']+)'/.exec(selector);
            if (!match) return;
            const key = match[1]!;
            if (opts?.hasText === "Edit") editingKey = key;
            if (opts?.hasText === "Save") { saved.add(key); editingKey = ""; }
            if (opts?.hasText === "Cancel") editingKey = "";
          },
        };
        return box;
      },
    };
  };
  let workerSeq = 0;
  const manager = {
    async withAnonymousContext<T>(op: (ctx: unknown) => Promise<T>): Promise<T> {
      const id = workerSeq++;
      return op({ newPage: async () => makePage(id) });
    },
  };
  const results = await editCheck(reader, manager as never, "abc102", {
    workers: 2,
    staggerMs: 0,
    makeDriver: (p, s, o) => {
      const drv = new Driver(p, s, { ...o, timeout: 0.05, quiet: 0, pollMs: 1 });
      (drv as unknown as { open: () => Promise<void>; settle: () => Promise<void> }).open = async () => { openCalls += 1; };
      (drv as unknown as { settle: () => Promise<void> }).settle = async () => {};
      return drv;
    },
  });
  // Worker 0 opens once (cards 0,1; card 0 mismatches and is NOT retried). Worker 1 fails View Details twice -> openCalls = 3 total.
  expect(openCalls).toBe(3);
  expect(results.map(r => r.index)).toEqual([0, 1, 2, 3]);
  expect(results[0]).toMatchObject({ index: 0, equal: false });
  expect(results[1]).toMatchObject({ index: 1, equal: true });
  expect(results[2]).toMatchObject({ index: 2, equal: false, edit: null });
  expect(results[3]).toMatchObject({ index: 3, equal: false, edit: null });

  // Verify fail-closed gate deletion parity when parallel editCheck reports a single slice failure.
  worker1FailsAlways = true;
  workerSeq = 0;
  const deleted: string[] = [];
  await expect(publishChecked("ParallelGate", cards, {
    lists: {
      lists: async () => [{ key: "abc102", name: "ParallelGate" }],
      create: async () => "abc102",
      delete: async id => { deleted.push(id); },
    },
    check: async (listId, submitted) => verify(listId, {
      reader,
      rate: async () => ({}),
      rerate: async () => cents(10.48),
      edit: async id => editCheck(reader, manager as never, id, {
        workers: 2,
        staggerMs: 0,
        makeDriver: (p, s, o) => {
          const drv = new Driver(p, s, { ...o, timeout: 0.05, quiet: 0, pollMs: 1 });
          (drv as unknown as { open: () => Promise<void>; settle: () => Promise<void> }).open = async () => {};
          (drv as unknown as { settle: () => Promise<void> }).settle = async () => {};
          return drv;
        },
      }),
    }, submitted),
  })).rejects.toThrow(/publish gate/);
  expect(deleted).toEqual(["abc102"]);
});

test("editCheck respects AUTOCALC_EDIT_WORKERS=1 for sequential execution and tagCard avoids stringify on direct _cartId", async () => {
  const prevEnv = process.env.AUTOCALC_EDIT_WORKERS;
  process.env.AUTOCALC_EDIT_WORKERS = "1";
  try {
    const cards = [0, 1, 2].map(i => ({ rewriteValue: STORED_FORM, selectedProduct: { amount: 10.48, _cartId: `S${i}`, serviceCode: "ecs" } }));
    const reader = { getUncached: async () => ({ retCode: "200", data: { cartListData: cards } }) };
    let contexts = 0;
    const manager = {
      async withAnonymousContext<T>(op: (ctx: unknown) => Promise<T>): Promise<T> {
        contexts += 1;
        return op({ newPage: async () => ({ on() {}, evaluate: async () => undefined, getByRole: () => ({ click: async () => { throw new Error("stop"); } }) }) });
      },
    };
    const results = await editCheck(reader, manager as never, "abc103", {
      staggerMs: 0,
      makeDriver: (p, s, o) => {
        const drv = new Driver(p, s, { ...o, timeout: 0.05, quiet: 0, pollMs: 1 });
        (drv as unknown as { open: () => Promise<void> }).open = async () => {};
        (drv as unknown as { settle: () => Promise<void> }).settle = async () => {};
        return drv;
      },
    });
    expect(contexts).toBe(2); // 1 slice tried twice on openFailed
    expect(results.map(r => r.index)).toEqual([0, 1, 2]);
  } finally {
    if (prevEnv === undefined) delete process.env.AUTOCALC_EDIT_WORKERS;
    else process.env.AUTOCALC_EDIT_WORKERS = prevEnv;
  }

  // Test the real page-bridge tagCard helper directly against mocked Vue vnodes.
  let stringified = 0;
  const attrs: Record<string, string> = {};
  const vnode = (id: string, elAttrs: Record<string, string>, direct = true) => ({
    type: { __name: "collapse-card-item" },
    props: {
      sourceData: direct
        ? { selectedProduct: { _cartId: id }, heavy: { toJSON() { stringified += 1; return {}; } } }
        : { nested: { key: id } },
    },
    subTree: { el: { setAttribute(k: string, v: string) { elAttrs[k] = v; } } },
  });
  const root = { type: { __name: "root" }, props: {}, subTree: { children: [{ component: vnode("CARD_1", attrs, true) }, { component: vnode("FALLBACK_2", {}, false) }] } };
  const prevDoc = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = { querySelector: () => ({ __vue_app__: { _instance: root } }) };
  try {
    const install = new Function(`return (${INSTALL_SCRIPT})`)() as () => void;
    install();
    const invoke = new Function(`return (${SCRIPT})`)() as (p: { fn: string; args: unknown[] }) => Promise<unknown>;
    expect(await invoke({ fn: "tagCard", args: ["CARD_1"] })).toBe(true);
    expect(attrs["data-autocalc-card"]).toBe("CARD_1");
    expect(stringified).toBe(0);
    expect(await invoke({ fn: "tagCard", args: ["FALLBACK_2"] })).toBe(true);
  } finally {
    delete (globalThis as { __autocalc_page_bridge_v1__?: unknown }).__autocalc_page_bridge_v1__;
    (globalThis as { document?: unknown }).document = prevDoc;
  }
});
