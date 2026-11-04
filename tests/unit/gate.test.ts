import { expect, test } from "bun:test";
import { CalculatorError } from "../../src/core/errors.ts";
import { cardCheck, checkToJson, publishChecked, requestIssues, verify, type CardCheck } from "../../src/core/gate.ts";
import { cents } from "../../src/core/quote/decimal.ts";
import type { EditResult } from "../../src/core/page/edit.ts";

type Dict = Record<string, any>;
const card = (amount = 10, title = "custom.ecs 1"): Dict => ({ selectedProduct: { amount, _customTitle: title, serviceCode: "ecs", productAllInfos: [], chargeModeName: "MONTHLY" }, rewriteValue: {} });
const D = (value: string | number) => cents(value);
class FakeLists {
  created: Dict[] = []; deleted: string[] = [];
  constructor(private readonly deleteFails = false) {}
  async create(payload: Dict) { this.created.push(payload); return "L1"; }
  async delete(id: string) { if (this.deleteFails) throw new Error("boom"); this.deleted.push(id); }
}
const checker = (checks: CardCheck[], issues: string[] = []) => async () => ({ checks, issues: [...issues] });
const publish = (lists: FakeLists, check: Parameters<typeof publishChecked>[2]["check"], env: Record<string, string> = {}) => publishChecked("n", [card()], { lists: lists as never, check, env });
const failure = async (promise: Promise<unknown>) => { try { await promise; } catch (error) { return error as Error & { code: string; details: Dict }; } throw new Error("expected a failure"); };

test("all agree: the link is returned and the list is kept", async () => {
  const lists = new FakeLists(), out = await publish(lists, checker([cardCheck(0, "t", D(10), { rated: D(10), edit: D(10) })]));
  expect(out.url.endsWith("shareListId=L1&currentCurrency=USD")).toBe(true);
  expect(lists.deleted).toEqual([]);
  expect(out.checks[0]!.ok).toBe(true);
});

test("a failing card deletes the list, reports both amounts and returns no link", async () => {
  const lists = new FakeLists(), bad = cardCheck(0, "t", D("10.48"), { rated: D("10.48"), edit: D("9.83"), problems: ["Edit re-prices to 9.83, stored 10.48"] });
  const error = await failure(publish(lists, checker([bad])));
  expect(error.code).toBe("GATE_FAILED");
  expect(lists.deleted).toEqual(["L1"]);
  expect(error.details.cards[0]).toMatchObject({ stored: "10.48", edit: "9.83", ok: false });
  expect(error.details.list_id).toBeNull();
});

test("a list-level issue fails too", async () => {
  const lists = new FakeLists(), error = await failure(publish(lists, checker([cardCheck(0, "t", D(1))], ["totalPrice 2 != sum(items) 1"])));
  expect(lists.deleted).toEqual(["L1"]);
  expect(error.details.cards).toContainEqual({ issue: "totalPrice 2 != sum(items) 1" });
});

test("a check that cannot run fails closed", async () => {
  const lists = new FakeLists(), error = await failure(publish(lists, async () => { throw new Error("no browser"); }));
  expect(error.message).toContain("could not run: no browser");
  expect(lists.deleted).toEqual(["L1"]);
  expect((error.cause as Error).message).toBe("no browser");
});

test("a failed delete names the list", async () => {
  const error = await failure(publish(new FakeLists(true), checker([cardCheck(0, "t", D(1), { problems: ["x"] })])));
  expect(error.message).toContain("delete list L1 by hand");
  expect(error.details.list_id).toBe("L1");
});

test("AUTOCALC_KEEP_ON_FAIL keeps and names the list", async () => {
  const lists = new FakeLists(), error = await failure(publish(lists, checker([cardCheck(0, "t", D(1), { problems: ["x"] })]), { AUTOCALC_KEEP_ON_FAIL: "1" }));
  expect(error.message).toContain("L1 was kept");
  expect(lists.deleted).toEqual([]);
  expect(error.details.list_id).toBe("L1");
});

test("an empty publication creates nothing", async () => {
  const lists = new FakeLists();
  expect((await failure(publishChecked("n", [], { lists: lists as never, check: checker([]) }))).code).toBe("VALIDATION");
  expect(lists.created).toEqual([]);
});

test("the gate rejects missing, duplicate and unexpected checks", async () => {
  for (const indices of [[], [1], [0, 0], [0, 1]]) {
    const lists = new FakeLists();
    await failure(publish(lists, checker(indices.map(index => cardCheck(index, "t", D(10))))));
    expect(lists.deleted).toEqual(["L1"]);
  }
});

const reader = (cards: Dict[]) => ({ getUncached: async () => ({ retCode: "200", data: { cartListData: cards } }) });
const deps = (cards: Dict[], edit: (id: string) => Promise<EditResult[]>, rate: (card: Dict) => Promise<ReturnType<typeof D>>) =>
  ({ reader: reader(cards), edit, rate: async () => ({}), rerate: rate });

test("verify combines rating, Edit and validation", async () => {
  const cards = [card(10), card(20, "b")];
  const rates: Record<number, ReturnType<typeof D>> = { 10: D("10.00"), 20: D("19.99") };
  const { checks, issues } = await verify("abc1", deps(cards,
    async () => [{ index: 0, stored: D(10), edit: D(10), equal: true }, { index: 1, stored: D(20), edit: null, equal: false, reason: "Edit view did not open" }],
    async c => rates[c.selectedProduct.amount]!));
  expect(checks[0]!.problems.filter(p => !p.startsWith("["))).toEqual([]);
  expect(checks[0]!.rated).toEqual(D("10.00"));
  expect(checks[1]!.problems.slice(0, 2)).toEqual(["rating engine prices the products at 19.99, stored 20.00", "Edit view did not open"]);
  expect(issues.every(issue => !issue.startsWith("[b]"))).toBe(true);
});

test("verify marks an unratable or unchecked card failed", async () => {
  const { checks } = await verify("abc1", deps([card(10)], async () => [], async () => { throw new Error("no price"); }));
  expect(checks[0]!.problems.slice(0, 2)).toEqual(["could not be re-priced: no price", "the Edit check returned no result for this card"]);
});

test("verify rejects duplicate Edit results", async () => {
  const result: EditResult = { index: 0, stored: D(10), edit: D(10), equal: true };
  const { issues } = await verify("abc1", deps([card()], async () => [result, result], async () => D(10)));
  expect(issues.some(issue => issue.includes("duplicate"))).toBe(true);
});

test("verify compares saved cards with the request", async () => {
  for (const mutation of ["form", "quantity", "spec", "missing"]) {
    const expected = card();
    expected.rewriteValue = { global_QUANTITY: { UNSET_Stepper_0: { measureValue: 3 } }, template_RENDER: { size: 100 } };
    expected.selectedProduct.productAllInfos = [{ resourceSpecCode: "requested", productNum: 3 }];
    const saved = structuredClone(expected);
    if (mutation === "form") saved.rewriteValue.template_RENDER.size = 1;
    if (mutation === "quantity") saved.selectedProduct.productAllInfos[0].productNum = 1;
    if (mutation === "spec") saved.selectedProduct.productAllInfos[0].resourceSpecCode = "wrong";
    const { checks, issues } = await verify("abc1", deps(mutation === "missing" ? [] : [saved], async () => mutation === "missing" ? [] : [{ index: 0, stored: D(10), edit: D(10), equal: true }], async () => D(10)), [expected]);
    expect(issues.length > 0 || checks.some(check => check.problems.length > 0)).toBe(true);
  }
  expect(requestIssues({ rewriteValue: { a: { b: 1 } } }, { rewriteValue: { a: {} } })).toEqual(["saved card differs from the request at rewriteValue.a.b"]);
});

test("cents rounds half away from zero and prints two places", () => {
  expect(cents(0.005)).toEqual({ n: 1n, s: 2 });
  expect(cents(-0.005)).toEqual({ n: -1n, s: 2 });
  expect(cents(1e-7)).toEqual({ n: 0n, s: 2 });
  expect(cents("10.499")).toEqual({ n: 1050n, s: 2 });
});

const obsCard = (amount: number): Dict => ({ selectedProduct: { amount, _customTitle: "obs", serviceCode: "obs", productAllInfos: [], chargeModeName: "ONDEMAND" }, rewriteValue: {} });

test("a known portal defect on Edit does not fail a card whose stored and rated prices agree, and says so", async () => {
  const { checks } = await verify("abc1", deps([obsCard(10)], async () => [{ index: 0, stored: D(10), edit: D(4), equal: false }], async () => D("10.00")));
  expect(checks[0]!.problems.filter(p => !p.startsWith("["))).toEqual([]);
  expect(checkToJson(checks[0]!).edit_skipped).toContain("GH-2-OBS-STORAGE-EDIT-DROP");
});

test("a known defect never excuses a rating mismatch or an Edit view that did not open", async () => {
  const mismatch = await verify("abc1", deps([obsCard(10)], async () => [{ index: 0, stored: D(10), edit: D(4), equal: false }], async () => D("9.00")));
  expect(mismatch.checks[0]!.problems[0]).toContain("rating engine prices the products at 9.00");
  const unopened = await verify("abc1", deps([obsCard(10)], async () => [{ index: 0, stored: D(10), edit: null, equal: false, reason: "Edit view did not open" }], async () => D("10.00")));
  expect(unopened.checks[0]!.problems).toContain("Edit view did not open");
});

test("an Edit drift on a service with no known defect still fails", async () => {
  const { checks } = await verify("abc1", deps([card(10)], async () => [{ index: 0, stored: D(10), edit: D(4), equal: false }], async () => D("10.00")));
  expect(checks[0]!.problems.some(p => p.includes("Edit re-prices to 4.00"))).toBe(true);
  expect(checkToJson(checks[0]!).edit_skipped).toBeUndefined();
});

class UnknownSave extends FakeLists {
  constructor(private readonly outcome: "created" | "none" | "twice", private readonly existing: string[] = []) { super(); }
  private after: string[] = [];
  async lists() { return [...this.existing, ...this.after].map(key => ({ key, name: "n" })); }
  override async create(): Promise<string> {
    this.after = this.outcome === "created" ? ["NEW"] : this.outcome === "twice" ? ["N1", "N2"] : [];
    throw Object.assign(new CalculatorError("MUTATION_UNKNOWN", "Saved-list operation outcome is unknown"), {});
  }
}
const passing = (): Parameters<typeof publishChecked>[2]["check"] => async () => ({ checks: [cardCheck(0, "c", D(10), { rated: D(10), edit: D(10) })], issues: [] });

test("a save with an unknown outcome adopts the one new list of that name and still verifies it", async () => {
  const lists = new UnknownSave("created", ["OLD"]);
  const result = await publishChecked("n", [card()], { lists: lists as never, check: async id => { expect(id).toBe("NEW"); return passing()(id, []); }, env: {} });
  expect(result.id).toBe("NEW");
});

test("an unknown save outcome with no new list says it is safe to retry; two new lists name both", async () => {
  expect(await failure(publishChecked("n", [card()], { lists: new UnknownSave("none") as never, check: passing(), env: {} }))).toMatchObject({ code: "MUTATION_UNKNOWN", hint: "It is safe to run the command again." });
  expect((await failure(publishChecked("n", [card()], { lists: new UnknownSave("twice") as never, check: passing(), env: {} }))).details).toEqual({ created: ["N1", "N2"] });
});
