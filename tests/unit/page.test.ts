import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ADD_TO_LIST, Driver, type PageLike } from "../../src/core/page/driver.ts";
import { cardSteps, forPage, formValues, sameValue, type Step } from "../../src/core/page/replay.ts";
import { cardFromCartItem, frontendVersion, newCartKey, rewriteMismatches, SCRIPT } from "../../src/core/page/store.ts";
import { pageEncodeFailed } from "../../src/core/errors.ts";

const cart = JSON.parse(readFileSync(join(import.meta.dir, "..", "fixtures", "page", "cart_monthly.json"), "utf8")).cartListDataBase as Record<string, any>;
const [cartKey, cartItem] = Object.entries(cart)[0]!;
const RATING = "https://portal-intl.huaweicloud.com/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource";
const M = (value: number) => ({ measureId: 17, measureValue: value, measureNameBeforeTrans: "" });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

class Clock { now = 0; read = () => this.now; }
type Fns = Record<string, unknown>;
class FakePage {
  handlers: Record<string, Array<(arg: unknown) => void>> = {};
  typed: Record<string, string> = {}; pressed: Array<[string, string]> = []; clicked: string[] = []; calls: unknown[][] = []; nativeTimeouts: unknown[] = [];
  constructor(readonly clock: Clock, public fns: Fns = {}) {}
  on(event: string, listener: (arg: any) => void) { (this.handlers[event] ??= []).push(listener); }
  emit(event: string, arg: unknown) { for (const listener of this.handlers[event] ?? []) listener(arg); }
  async evaluate(script: string, arg?: { fn: string; args: unknown[] }) {
    if (arg === undefined) return undefined; // bridge install
    expect(script).toBe(SCRIPT);
    this.calls.push([arg.fn, ...arg.args]);
    const fn = this.fns[arg.fn];
    return typeof fn === "function" ? (fn as (...a: unknown[]) => unknown)(...arg.args) : fn;
  }
  async waitForTimeout(ms: number) { this.clock.now += ms / 1000; }
  async goto() {}
  async click(selector: string) { this.clicked.push(selector); (this.fns._onClick as ((s: string) => void) | undefined)?.(selector); }
  locator(selector: string) {
    const page = this;
    const box = {
      first: () => box,
      isVisible: async () => !!(page.fns._visible as Record<string, boolean> | undefined)?.[selector],
      isDisabled: async () => !!(page.fns._disabled as Record<string, boolean> | undefined)?.[selector],
      fill: async (text: string, options?: { timeout?: number }) => { page.nativeTimeouts.push(options?.timeout); page.typed[selector] = text; },
      press: async (key: string, options?: { timeout?: number }) => { page.nativeTimeouts.push(options?.timeout); page.pressed.push([selector, key]); },
      blur: async (options?: { timeout?: number }) => { page.nativeTimeouts.push(options?.timeout); },
    };
    return box;
  }
}
const driverFor = (page: FakePage, clock: Clock, service = "ecs") => new Driver(page as unknown as PageLike, service, { timeout: 5, quiet: 1.5, clock: clock.read });
const RADIO = { kind: "base-radio-group", id: "calculator_ecs_radio_2", options: [{ value: "aC8", text: "aC8" }, { value: "C7n", text: "C7n" }] };
const failure = async (run: Promise<unknown>) => run.then(() => { throw new Error("expected failure"); }, error => error as { code: string; message: string; details: Record<string, any> });
const response = (request: unknown, status = 200, body: unknown = {}) => ({ url: () => (request as { url(): string }).url(), status: () => status, request: () => request, json: async () => body });
const request = (url: string, resourceType = "xhr") => ({ url: () => url, resourceType: () => resourceType });
const capturePage = (clock: Clock, grows = true) => {
  const state: Record<string, unknown> = {};
  return new FakePage(clock, { removeOverlays: true, cartKeys: () => Object.keys(state), cartItem: (key: string) => state[key], _onClick: () => { if (grows) state[cartKey] = cartItem; } });
};

test("page encode failure carries step, field and frontend version", () => {
  const error = pageEncodeFailed("Flavor not offered.", { service: "ecs", field: "f", frontendVersion: "11.4.201" });
  expect(error.code).toBe("PAGE_ENCODE_FAILED");
  expect(error.details).toEqual({ service: "ecs", field: "f", frontend_version: "11.4.201" });
  expect(error.hint).toContain("AUTOCALC_PAGE_HEADED=1");
  expect(pageEncodeFailed("x", { service: "ecs", step: "inquiry" }).details).toEqual({ service: "ecs", step: "inquiry" });
});

test("store normalizers keep the saved card keys and the page rewrite rule", () => {
  const card = cardFromCartItem(cartItem);
  expect(Object.keys(card).sort()).toEqual(["buyUrl", "rewriteValue", "selectedProduct"]);
  expect(card.selectedProduct).toMatchObject({ chargeModeName: "MONTHLY", amount: 132.22 });
  expect(newCartKey(["a"], ["a", "b"])).toBe("b");
  expect(newCartKey(["a"], ["a"])).toBeUndefined();
  expect(newCartKey([], ["a", "b"])).toBeUndefined(); // ambiguous: never guess
  expect(frontendVersion(["https://example.com/x.js", "https://portal.hc-cdn.com/CBC-PortalCalculator/11.4.201/framework.js"])).toBe("11.4.201");
  expect(frontendVersion(["https://example.com/x.js"])).toBeUndefined();
  const stored = cartItem.rewriteValue;
  expect(rewriteMismatches(stored, clone(stored))).toEqual([]);
  const dropped = clone(stored); delete dropped.template_RENDER.calculator_evs_stepper["calculator_evs_stepper_|addible0|_1"];
  expect(rewriteMismatches(stored, dropped)).toEqual(["template_RENDER.calculator_evs_stepper.calculator_evs_stepper_|addible0|_1"]);
  const resized = clone(stored); resized.global_PERIODTIME.UNSET_PeriodTime.measureId = 19;
  expect(rewriteMismatches(stored, resized)).toEqual(["global_PERIODTIME.UNSET_PeriodTime.measureId"]);
  const extra = { ...clone(stored), global_FEEINSTALLMODE: { feeInstallMode: null } };
  expect(rewriteMismatches({ ...stored, x: null, y: {} }, extra)).toEqual([]); // extra keys and empty stored values do not count
});

const STATE = {
  global_REGIONINFO: { region: "sa-brazil-1", chargeMode: "PERIOD" },
  global_PERIODTIME: { UNSET_PeriodTime: { measureValue: 2, measureId: 20 } },
  global_QUANTITY: { UNSET_Stepper_0: M(3) },
  template_RENDER: {
    calculator_ecs_radio: { arch: "dataInfo_1_" },
    calculator_evs_stepper: {
      calculator_evs_stepper_main: { type: "t1", UNSET_Stepper_0: M(40) },
      "calculator_evs_stepper_|addible0|_0": { type: "t1", UNSET_Stepper_0: M(50) },
      "calculator_evs_stepper_|addible0|_1": { type: "t1", UNSET_Stepper_0: M(60) },
    },
    calculator_sfsPeriod_36input: 3.6,
  },
};

test("card steps flatten globals, addible rows and measures", () => {
  const steps = cardSteps(STATE);
  expect(steps.slice(0, 3)).toEqual([{ componentId: "global_REGIONINFO_region", kind: "region", value: "sa-brazil-1" }, { componentId: "global_REGIONINFO_chargeMode", kind: "radio", value: "PERIOD" }, { componentId: "global_PERIODTIME_UNSET_PeriodTime", kind: "radio", value: "2_20" }]);
  expect(steps).toContainEqual({ componentId: "calculator_evs_stepper_main_Stepper_0", kind: "auto", value: 40 });
  expect(steps).toContainEqual({ componentId: "calculator_sfsPeriod_36input", kind: "auto", value: 3.6 });
  expect(steps.at(-1)).toEqual({ componentId: "global_QUANTITY_Stepper_0", kind: "auto", value: 3 });
  const adds = steps.flatMap((s, i) => s.kind === "add" ? [i] : []);
  expect(adds).toHaveLength(2); // one click per row, not per leaf
  expect(steps[adds[1]! + 1]).toEqual({ componentId: "calculator_evs_stepper_|addible0|_1_type", kind: "auto", value: "t1" });
});

test("same value treats '6' and 6.0 alike and ignores checkbox order", () => {
  expect(sameValue("6", 6.0)).toBe(true);
  expect(sameValue(null, 0)).toBe(false);
  expect(sameValue("", 0)).toBe(false);
  expect(sameValue(["a", "b"], ["b", "a"])).toBe(true);
  expect(sameValue(["a"], ["a", "b"])).toBe(false);
  expect(Object.keys(formValues(STATE.template_RENDER))).toContain("calculator_evs_stepper_|addible0|_1_Stepper_0");
});

test("SFS Turbo on-demand cards use the page's Demand control ids", () => {
  const renamed = forPage("sfsturbo", { global_REGIONINFO: { chargeMode: "ONDEMAND" }, template_RENDER: { calculator_sfsPeriod_36input: 3.6, other: 1 } }) as { template_RENDER: Record<string, unknown> };
  expect(Object.keys(renamed.template_RENDER)).toEqual(["calculator_sfsDemand_36input", "other"]);
});

test("a radio step clicks and reads back", async () => {
  const clock = new Clock(); let shown = "aC8";
  const page = new FakePage(clock, { describe: RADIO, clickOption: (_cfg: string, value: string) => { shown = value; return "ok"; }, readBack: () => shown });
  await driverFor(page, clock).apply({ componentId: "calculator_ecs_radio_generation", kind: "radio", value: "C7n" });
  expect(page.calls).toContainEqual(["clickOption", "calculator_ecs_radio_generation", "C7n"]);
});

test("a checkbox group is ticked until the form holds exactly the wanted boxes", async () => {
  const clock = new Clock(); let held: string[] = ["dataInfo_9_", "dataInfo_11_"];
  const page = new FakePage(clock, { describe: { kind: "base-checkbox-group", id: "g", options: [] }, formState: () => ({ template_RENDER: { value: { calculator_Pack_checkboxGroup: { packageType: held } } } }), setChecks: (_cfg: string, values: string[]) => { if (held.join() === values.join()) return "ok"; held = values; return "clicked"; } });
  await driverFor(page, clock).apply({ componentId: "calculator_Pack_checkboxGroup_packageType", kind: "auto", value: ["dataInfo_9_"] });
  expect(page.calls).toContainEqual(["setChecks", "calculator_Pack_checkboxGroup_packageType", ["dataInfo_9_"]]);
});

test("a read-back mismatch names the field", async () => {
  const clock = new Clock();
  const error = await failure(driverFor(new FakePage(clock, { describe: RADIO, clickOption: "ok", readBack: "aC8" }), clock).apply({ componentId: "calculator_ecs_radio_generation", kind: "radio", value: "C7n" }));
  expect(error.details.field).toBe("calculator_ecs_radio_generation");
  expect(error.message).toContain('shows "aC8"');
});

test("a missing option names the field and lists the offer, after waiting for it", async () => {
  const clock = new Clock();
  const error = await failure(driverFor(new FakePage(clock, { describe: RADIO }), clock).apply({ componentId: "calculator_ecs_radio_generation", kind: "radio", value: "X9" }));
  expect(error.details.field).toBe("calculator_ecs_radio_generation");
  expect(error.message).toContain('["aC8","C7n"]');
  expect(clock.now).toBeGreaterThanOrEqual(5);
});

test("a missing control names the field within one step budget", async () => {
  const clock = new Clock(), driver = driverFor(new FakePage(clock, { describe: null, formState: {} }), clock);
  const error = await failure(driver.apply({ componentId: "missing", kind: "auto", value: "value" }));
  expect(error.details.field).toBe("missing");
  expect(clock.now).toBeLessThanOrEqual(driver.timeout + 0.1);
});

test("a stepper types, presses Enter and reads back", async () => {
  const clock = new Clock(), sel = "[id='calculator_evs_stepper_1_1'] input:visible";
  const page = new FakePage(clock, { describe: { kind: "base-stepper", id: "calculator_evs_stepper_1_1", options: [] }, readBack: () => page.typed[sel] });
  await driverFor(page, clock).apply({ componentId: "calculator_evs_stepper_|addible0|_0_Stepper_0", kind: "stepper", value: 50 });
  expect(page.typed).toEqual({ [sel]: "50" });
  expect(page.pressed).toEqual([[sel, "Enter"]]);
  expect(page.nativeTimeouts).toEqual([5000, 5000, 5000]);
});

test("a clamped stepper value fails", async () => {
  const clock = new Clock();
  const page = new FakePage(clock, { describe: { kind: "base-stepper", id: "calculator_evs_stepper_0_1", options: [] }, readBack: "40" });
  expect((await failure(driverFor(page, clock).apply({ componentId: "calculator_evs_stepper_main_Stepper_0", kind: "stepper", value: 20 }))).details.field).toBe("calculator_evs_stepper_main_Stepper_0");
});

test("an add step clicks and waits for a new row; none appearing fails", async () => {
  const clock = new Clock(), rows: Record<string, unknown> = { calculator_evs_stepper_main: {} };
  const page = new FakePage(clock, { formState: () => ({ template_RENDER: { value: { calculator_evs_stepper: { ...rows } } } }), _onClick: () => { rows[`calculator_evs_stepper_|addible0|_${Object.keys(rows).length - 1}`] = {}; } });
  await driverFor(page, clock).apply({ componentId: "calculator_evs_stepper", kind: "add" });
  expect(page.clicked).toEqual(["[id='calculator_evs_stepper'] .common-addible-addDisk"]);
  const still = new FakePage(clock, { formState: { template_RENDER: { value: { calculator_evs_stepper: {} } } } });
  expect((await failure(driverFor(still, clock).apply({ componentId: "calculator_evs_stepper", kind: "add" }))).details.field).toBe("calculator_evs_stepper");
});

test("a radio stepper prefers an offered preset, and falls back to typing a custom number", async () => {
  const clock = new Clock();
  const preset = new FakePage(clock, { describe: { kind: "base-radio-stepper", id: "parent", options: [] }, radioStepper: { kind: "base-radio-group", id: "nested", options: [{ value: 16, text: "16 GB" }] }, clickOption: "ok", readBack: "16 GB" });
  await driverFor(preset, clock).apply({ componentId: "memory", kind: "auto", value: 16 });
  expect(preset.calls).toContainEqual(["clickOption", "memory", 16]);
  expect(preset.typed).toEqual({});
  const custom = new FakePage(clock, { describe: { kind: "base-radio-stepper", id: "parent", options: [] }, radioStepper: null, readBack: "18" });
  await driverFor(custom, clock).apply({ componentId: "memory", kind: "auto", value: 18 });
  expect(custom.typed).toEqual({ "[id='parent'] input:visible": "18" });
});

test("a hidden control is skipped only when the form already holds the value", async () => {
  const clock = new Clock(), form = { template_RENDER: { value: { calculator_ip: { UNSET_Stepper_0: M(2) } } } };
  await driverFor(new FakePage(clock, { describe: null, formState: form }), clock, "elb").apply({ componentId: "calculator_ip_Stepper_0", kind: "auto", value: 2 });
  expect((await failure(driverFor(new FakePage(clock, { describe: null, formState: form }), clock, "elb").apply({ componentId: "calculator_ip_Stepper_0", kind: "auto", value: 3 }))).details.field).toBe("calculator_ip_Stepper_0");
});

test("capture returns the new card after the price settles", async () => {
  const clock = new Clock(), page = capturePage(clock), driver = driverFor(page, clock), req = request(RATING);
  page.emit("request", req); clock.now += 1; page.emit("response", response(req, 200, { amount: 1 }));
  const card = await driver.capture();
  expect(Object.keys(card).sort()).toEqual(["buyUrl", "rewriteValue", "selectedProduct"]);
  expect((card.selectedProduct as { amount: number }).amount).toBe(132.22);
  expect(page.clicked).toEqual([ADD_TO_LIST]);
  expect(clock.now).toBeGreaterThanOrEqual(2.5); // waited the quiet period after the last rating response
});

test("capture fails on a failed inquiry and clicks nothing", async () => {
  const clock = new Clock(), page = capturePage(clock), driver = driverFor(page, clock), req = request(RATING);
  page.emit("request", req); page.emit("response", response(req, 200, { exceptionId: "CBC.6006" }));
  expect((await failure(driver.capture())).details.step).toBe("inquiry");
  expect(page.clicked).toEqual([]);
});

test("capture ignores a failed inquiry of an earlier form state", async () => {
  const clock = new Clock(), page = capturePage(clock);
  Object.assign(page.fns, { describe: RADIO, clickOption: "ok", readBack: "C7n" });
  const driver = driverFor(page, clock), early = request(RATING);
  page.emit("request", early); // sent while the form was still in its previous state
  await driver.apply({ componentId: "calculator_ecs_radio_generation", kind: "radio", value: "C7n" });
  page.emit("response", response(early, 200, { exceptionId: "CBC.6006" }));
  const final = request(RATING);
  page.emit("request", final); page.emit("response", response(final, 200, { amount: 1 }));
  expect(((await driver.capture()).selectedProduct as { amount: number }).amount).toBe(132.22);
});

test("capture reports a cart that never grows, a disabled Add to List, and a price that never settles", async () => {
  const clock = new Clock();
  expect((await failure(driverFor(capturePage(clock, false), clock).capture())).details.step).toBe("add_to_list");
  const disabled = capturePage(clock); disabled.fns._disabled = { [ADD_TO_LIST]: true };
  const error = await failure(driverFor(disabled, clock).capture());
  expect(error.message).toContain("Add to List is disabled");
  const late = capturePage(clock); late.fns._disabled = { [ADD_TO_LIST]: true };
  const enable = late.locator.bind(late);
  let polls = 0;
  late.locator = ((selector: string, options?: unknown) => { const box = (enable as (s: string, o?: unknown) => ReturnType<typeof late.locator>)(selector, options); const real = box.isDisabled; box.isDisabled = async () => { if (selector === ADD_TO_LIST && ++polls > 2) (late.fns._disabled as Record<string, boolean>)[ADD_TO_LIST] = false; return real(); }; return box; }) as typeof late.locator;
  expect(((await driverFor(late, clock).capture()).selectedProduct as { amount: number }).amount).toBeGreaterThan(0);
  const stuck = capturePage(clock), driver = driverFor(stuck, clock);
  stuck.emit("request", request(RATING)); // never answered
  expect((await failure(driver.capture())).details.step).toBe("price");
});

test("capture waits for the region catalog to finish loading, not merely to answer", async () => {
  const clock = new Clock(), page = capturePage(clock), driver = driverFor(page, clock);
  const catalog = request("https://x/portalcalculatornodeservice/v4/api/productInfo?region=la-south-2");
  page.emit("request", catalog); page.emit("response", response(catalog));
  expect((await failure(driver.capture())).details.step).toBe("price");
  const done = capturePage(clock), second = driverFor(done, clock), again = request(catalog.url());
  done.emit("request", again); done.emit("response", response(again)); done.emit("requestfinished", again);
  expect(((await second.capture()).selectedProduct as { amount: number }).amount).toBe(132.22);
});

test("mount-failure diagnostics exclude tokens and messages", async () => {
  const clock = new Clock(), page = new FakePage(clock, { ready: false, loadState: { ready: "complete", vue: false } });
  const driver = driverFor(page, clock);
  page.emit("requestfailed", request("https://assets.test/private/token?secret=hidden", "script"));
  page.emit("pageerror", { name: "TypeError", message: "secret value" });
  const error = await failure(driver.open("https://calc.test/"));
  expect(error.details.step).toBe("open");
  expect(error.details.load).toEqual({ state: { ready: "complete", vue: false }, failed_resources: [{ host: "assets.test", type: "script", status: null }], script_errors: ["TypeError"] });
  expect(JSON.stringify(error)).not.toContain("secret");
});

test("the form state, not the display, decides a typed value", async () => {
  const clock = new Clock();
  const page = new FakePage(clock, { describe: { kind: "common-input", id: "x", options: [] }, formState: { template_RENDER: { value: { calculator_sfsPeriod_36input: 3.6 } } }, readBack: "1.2" }); // the page kept the old value
  expect((await failure(driverFor(page, clock).apply({ componentId: "calculator_sfsPeriod_36input", kind: "auto", value: 1.2 }))).message).toContain("shows 3.6 after typing 1.2");
});

test("an unknown control kind fails with its name", async () => {
  const clock = new Clock();
  expect((await failure(driverFor(new FakePage(clock, { describe: { kind: "base-slider", id: "x", options: [] } }), clock).apply({ componentId: "calculator_x", kind: "auto", value: 1 }))).message).toContain("base-slider");
});

// ---- encodeCard ----
import { encodeCard } from "../../src/core/page/encode.ts";
const PRICED = { region: "sa-brazil-1", chargeMode: "PERIOD" }; // what STATE asks for
const cardOf = (product: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ rewriteValue: { ...STATE, ...extra }, selectedProduct: { ...PRICED, ...product } });
const encode = (state: Record<string, unknown>, ...cards: unknown[]) => {
  const served = [...cards];
  const manager = { withAnonymousContext: async (operation: (context: unknown) => Promise<unknown>) => operation({ newPage: async () => ({}) }) };
  return encodeCard(manager as never, "sfsturbo", state, { makeDriver: () => ({ frontendVersion: "11.4.201", open: async () => {}, run: async () => {}, capture: async () => served.shift() as Record<string, unknown> }) });
};

test("encode tries again when the page priced another region, then fails naming it", async () => {
  const good = cardOf();
  expect(await encode(STATE, cardOf({ region: "ap-southeast-1" }), good)).toBe(good);
  const error = await failure(encode(STATE, ...Array(3).fill(cardOf({ region: "ap-southeast-1" }))));
  expect(error.details.step).toBe("region");
  expect(error.message).toContain("ap-southeast-1");
  expect((await failure(encode(STATE, ...Array(3).fill(cardOf({ chargeMode: "ONDEMAND" }))))).details.step).toBe("chargeMode");
});

test("encode accepts a text input value that means the same and rejects a lost value", async () => {
  const got = { calculator_ecs_radio: { arch: "dataInfo_1_" }, calculator_sfsPeriod_36input: "3.6", calculator_evs_stepper: STATE.template_RENDER.calculator_evs_stepper };
  const card = { rewriteValue: { ...STATE, template_RENDER: got }, selectedProduct: PRICED };
  expect(await encode(STATE, card)).toBe(card);
  const lacking = { rewriteValue: { ...STATE, template_RENDER: { ...STATE.template_RENDER, calculator_ecs_radio: { arch: "dataInfo_9_" } } } };
  const error = await failure(encode(STATE, lacking));
  expect(error.details).toMatchObject({ step: "form", field: "calculator_ecs_radio_arch" });
});

test("encode rejects a card that lost the requested quantity or period", async () => {
  for (const group of ["global_QUANTITY", "global_PERIODTIME"]) {
    const card = cardOf(); delete (card.rewriteValue as Record<string, unknown>)[group];
    expect((await failure(encode(STATE, card))).details.step).toBe("globals");
  }
});

test("asPageLike invokes a string script with its JSON argument (Playwright JS does not call strings)", async () => {
  const seen: unknown[] = [];
  const raw = { evaluate: async (expression: string) => { seen.push(expression); return "ok"; } };
  const { asPageLike } = await import("../../src/core/page/driver.ts");
  expect(await asPageLike(raw as never).evaluate("(x) => x", { a: 1 })).toBe("ok");
  expect(seen).toEqual(['((x) => x)({"a":1})']);
});
