/** Fill the calculator form from steps and capture the card the page builds.
 *
 * Values are set through the DOM (clicks and typing on the element whose component carries the
 * step's config id), never by writing the page's state, so the page's own per-service functions
 * run exactly as for a person. Every step is read back; any surprise throws PAGE_ENCODE_FAILED.
 * Port of autocalc/page/driver.py.
 */
import { CalculatorError, pageEncodeFailed } from "../errors.ts";
import { formValues, globalValues, sameValue, type Step } from "./replay.ts";
import { cardFromCartItem, frontendVersion, js, newCartKey, OVERLAYS } from "./store.ts";

export const CALCULATOR_URL = (service: string) => `https://www.huaweicloud.com/intl/en-us/pricing/calculator.html#/${service}`;
const RATING_PATH = "/ratingservice/v2/inquiry/resource";
// The catalog of the chosen region: until it arrives the page builds a card from the previous region's.
const CATALOG_PATH = "/portalcalculatornodeservice/v4/api/productInfo";
export const ADD_TO_LIST = "#rshema_func_priceboard_addToList";

type Dict = Record<string, any>;
/** The slice of a Playwright Page the driver uses; tests pass a fake. */
export interface PageLike {
  on(event: string, listener: (arg: any) => void): unknown;
  goto(url: string, options?: Dict): Promise<unknown>;
  evaluate(script: string, arg?: unknown): Promise<unknown>;
  click(selector: string, options?: Dict): Promise<unknown>;
  locator(selector: string): { first(): LocatorLike; isDisabled(): Promise<boolean> };
  waitForTimeout(ms: number): Promise<unknown>;
}
export interface LocatorLike { isVisible(): Promise<boolean>; fill(value: string, options?: Dict): Promise<unknown>; press(key: string, options?: Dict): Promise<unknown>; blur(options?: Dict): Promise<unknown> }

/** Playwright for JavaScript evaluates a string as an expression and never calls it (Python's treats a
 * function-looking string as a function), so call the script explicitly. Every real page goes through this. */
export function asPageLike(page: { evaluate(expression: string): Promise<unknown> } & Omit<PageLike, "evaluate">): PageLike {
  return new Proxy(page as unknown as PageLike, { get: (target, key) => key === "evaluate"
    ? (script: string, arg?: unknown) => target.evaluate(`(${script})(${arg === undefined ? "" : JSON.stringify(arg)})`)
    : (target as unknown as Record<string | symbol, unknown>)[key] instanceof Function ? ((target as unknown as Record<string | symbol, (...args: unknown[]) => unknown>)[key] as (...args: unknown[]) => unknown).bind(target) : (target as unknown as Record<string | symbol, unknown>)[key] });
}

export interface DriverOptions { timeout?: number; quiet?: number; pollMs?: number; clock?: () => number }
const stepKey = (step: Step) => step.componentId;
const numberText = (value: unknown) => String(Number(value));
const labelsOf = (option: Dict) => ["text", "activeLabel", "noActiveLabel"].filter(key => option[key] != null).map(key => String(option[key]).trim());

export class Driver {
  readonly timeout: number; private readonly quiet: number; private readonly pollMs: number; private readonly clock: () => number;
  frontendVersion: string | undefined;
  private stepDeadline: number | undefined;
  private inflight = 0;
  private catalogs = new Set<unknown>(); // region catalogs still loading
  private lastActivity: number;
  // Rating requests are tagged with the step current when they were sent: the form passes through
  // states the page cannot price (e.g. RI before the flavor is chosen); only the final state counts.
  private gen = 0;
  private sent = new Map<unknown, number>();
  private responses: Array<[any, number]> = [];
  private failedGens = new Set<number>();
  private loadFailures: Dict[] = [];
  private pageErrors: string[] = [];
  private loadState: unknown;

  constructor(readonly page: PageLike, public service: string, options: DriverOptions = {}) {
    this.timeout = options.timeout ?? 20; this.quiet = options.quiet ?? 1.5; this.pollMs = options.pollMs ?? 100;
    this.clock = options.clock ?? (() => performance.now() / 1000);
    this.lastActivity = this.clock();
    page.on("request", request => this.onRequest(request));
    page.on("response", response => this.onResponse(response));
    page.on("requestfailed", request => this.onFailed(request));
    page.on("requestfinished", request => this.onCatalogDone(request));
    page.on("pageerror", error => { this.pageErrors = [...this.pageErrors.slice(-7), String(error?.name ?? "Error").slice(0, 60)]; }); // names only: messages can contain upstream data
  }

  // ---- network watch ----
  private onRequest(request: any) {
    const url: string = request.url();
    // The page also reports failures with an `inquiryfailed` request, but it is sent after the failed
    // response and cannot be tied to the form state; the response itself is.
    if (url.includes(CATALOG_PATH)) this.catalogs.add(request);
    if (url.includes(RATING_PATH)) { this.inflight++; this.lastActivity = this.clock(); this.sent.set(request, this.gen); }
  }
  private onCatalogDone(request: any) { if (this.catalogs.delete(request)) { this.gen++; this.lastActivity = this.clock(); } } // fully loaded: the page re-prices after reading it
  private recordLoadFailure(request: any, status?: number) {
    const kind = request.resourceType?.() ?? "";
    if (!["document", "script", "xhr", "fetch"].includes(kind)) return;
    let host: string | null = null;
    try { host = new URL(request.url()).hostname; } catch { /* keep null */ }
    this.loadFailures = [...this.loadFailures.slice(-11), { host, type: kind, status: status ?? null }];
  }
  private onFailed(request: any) {
    this.recordLoadFailure(request);
    this.onCatalogDone(request);
    if (String(request.url?.() ?? "").includes(RATING_PATH)) { this.inflight = Math.max(0, this.inflight - 1); this.sent.delete(request); }
  }
  private onResponse(response: any) {
    const status: number = response.status?.() ?? 200;
    if (status >= 400 && response.request) this.recordLoadFailure(response.request(), status);
    if (String(response.url()).includes(RATING_PATH)) {
      this.inflight = Math.max(0, this.inflight - 1); this.lastActivity = this.clock();
      const request = response.request?.(), gen = this.sent.get(request) ?? this.gen;
      this.sent.delete(request);
      this.responses.push([response, gen]);
    }
  }
  private async checkInquiries() {
    const responses = this.responses; this.responses = [];
    for (const [response, gen] of responses) {
      let body: unknown;
      try { body = await response.json(); } catch { /* an unreadable body is judged by status alone */ }
      if (response.status() !== 200 || (body && typeof body === "object" && (body as Dict).exceptionId)) this.failedGens.add(gen);
    }
    if (this.failedGens.has(this.gen)) throw this.fail("The page reported a failed price inquiry.", { step: "inquiry" });
  }

  // ---- helpers ----
  private fail(message: string, info: { step?: string; field?: string } = {}): CalculatorError {
    const error = pageEncodeFailed(message, { service: this.service, ...info, frontendVersion: this.frontendVersion });
    if (info.step === "open") (error.details as Dict).load = { state: this.loadState ?? null, failed_resources: [...this.loadFailures], script_errors: [...this.pageErrors] };
    return error;
  }
  /** Poll `probe` until it returns something truthy; undefined on timeout. */
  async wait<T>(probe: () => Promise<T | undefined | null | false | "" | 0> | T, timeout?: number): Promise<T | undefined> {
    let deadline = this.clock() + (timeout ?? this.timeout);
    if (this.stepDeadline !== undefined) deadline = Math.min(deadline, this.stepDeadline);
    for (;;) {
      const value = await probe();
      if (value) return value as T;
      if (this.clock() >= deadline) return undefined;
      await this.page.waitForTimeout(this.pollMs);
    }
  }
  /** Keep Playwright's own waits inside the remaining step budget. */
  private nativeTimeoutMs() { const remaining = this.stepDeadline === undefined ? this.timeout : this.stepDeadline - this.clock(); return Math.max(1, remaining * 1000); }
  private touch() { this.lastActivity = this.clock(); }
  private async safeJs(fn: string, ...args: unknown[]) { try { return await js(this.page, fn, ...args); } catch { return undefined; } }

  // ---- page lifecycle ----
  /** Load the service's calculator page and wait until its form is mounted. */
  async open(url?: string) {
    try { await this.page.goto(url ?? CALCULATOR_URL(this.service), { waitUntil: "domcontentloaded", timeout: Math.trunc(this.timeout * 3000) }); }
    catch { this.loadState = await this.safeJs("loadState"); throw this.fail("The calculator page did not load.", { step: "open" }); }
    if (!await this.wait(() => this.safeJs("ready"), this.timeout * 3)) { this.loadState = await this.safeJs("loadState"); throw this.fail("The calculator form did not appear.", { step: "open" }); }
    this.frontendVersion = frontendVersion(await this.safeJs("version") ?? []);
    await js(this.page, "removeOverlays", OVERLAYS);
    this.touch();
  }

  // ---- steps ----
  async run(steps: Step[]) { for (const step of steps) await this.apply(step); }
  /** Start a new phase: rating failures from before this point no longer count. */
  mark() { this.gen++; this.touch(); }
  async apply(step: Step) {
    this.stepDeadline = this.clock() + this.timeout;
    try {
      this.gen++;
      let resolved: Step | undefined = step;
      if (step.kind === "auto") { resolved = await this.resolve(step); if (!resolved) return; } // let the form say what the control is
      if (resolved.kind === "add") await this.add(resolved);
      else if (resolved.kind === "stepper") await this.stepper(resolved);
      else if (resolved.kind === "checkbox") await this.checkboxes(resolved);
      else await this.choose(resolved);
      this.touch();
    } finally { this.stepDeadline = undefined; }
  }

  /** What the form state holds for this control, or undefined if it isn't a template control. */
  private async formValue(step: Step): Promise<unknown> {
    const form = (await js(this.page, "formState")) ?? {};
    const values = { ...globalValues(form), ...formValues(form.template_RENDER?.value ?? {}) };
    return values[stepKey(step)];
  }
  /** Does the form already hold this step's value (in a control the page keeps hidden)? */
  private async held(step: Step) { return sameValue(await this.formValue(step), step.value); }

  /** Turn an `auto` step into the kind of the control the form shows for it. A control the page
   * hides (the ELB IP count while the load balancer is private) is fine when the form already
   * holds the wanted value; otherwise the step fails. */
  private async resolve(step: Step): Promise<Step | undefined> {
    const describe = () => js(this.page, "describe", step.componentId);
    let ctl = await this.wait(describe, this.timeout / 4);
    if (!ctl && await this.held(step)) return undefined;
    ctl = ctl ?? await this.wait(describe);
    if (!ctl) throw this.fail(`The form has no control ${step.componentId}.`, { field: step.componentId });
    if (ctl.kind === "base-radio-stepper") ctl = (await js(this.page, "radioStepper", step.componentId, step.value)) ?? ctl;
    const kind = ({ "base-radio-group": "radio", "base-select": "select", "base-stepper": "stepper", "base-radio-stepper": "stepper", "common-input": "stepper", "base-checkbox-group": "checkbox" } as Record<string, Step["kind"]>)[ctl.kind];
    if (!kind) {
      if (await this.wait(() => this.held(step))) return undefined; // the page fills it in; e.g. OBS's one, disabled, already ticked package type
      throw this.fail(`${step.componentId} is a ${ctl.kind}, which the encoder cannot fill.`, { field: step.componentId });
    }
    return { componentId: step.componentId, kind, value: step.value };
  }

  /** The control and the requested option, waiting for both to appear (choices narrow later ones). */
  private async option(step: Step): Promise<[Dict, Dict]> {
    const found = await this.wait(async () => {
      let ctl = await js(this.page, "describe", step.componentId);
      if (ctl?.kind === "base-radio-stepper") ctl = (await js(this.page, "radioStepper", step.componentId, step.value)) ?? ctl;
      if (!ctl) return undefined;
      const option = ctl.options.find((o: Dict) => o.value === step.value);
      return option ? [ctl, option] as [Dict, Dict] : undefined;
    });
    if (found) return found;
    const ctl = await js(this.page, "describe", step.componentId);
    if (!ctl) throw this.fail(`The form has no control ${step.componentId}.`, { field: step.componentId });
    throw this.fail(`${JSON.stringify(step.value)} is not offered for ${step.componentId}; the form offers ${JSON.stringify(ctl.options.map((o: Dict) => o.value))}.`, { field: step.componentId });
  }

  private async choose(step: Step) {
    const [, option] = await this.option(step), labels = labelsOf(option);
    let result: unknown;
    if (step.kind === "radio") result = await js(this.page, "clickOption", step.componentId, step.value);
    else {
      result = await js(this.page, "openSelect", step.componentId);
      if (result === "ok") result = await this.wait(async () => (await js(this.page, "pickDropdown", labels)) === "ok" && "ok", 5);
    }
    if (result !== "ok") throw this.fail(`Could not set ${step.componentId} to ${JSON.stringify(step.value)} (${String(result)}).`, { field: step.componentId });
    if (!await this.wait(async () => labels.includes(String(await js(this.page, "readBack", step.componentId)).trim()))) {
      throw this.fail(`${step.componentId} shows ${JSON.stringify(await js(this.page, "readBack", step.componentId))} after choosing ${JSON.stringify(step.value)}.`, { field: step.componentId });
    }
    if (step.kind === "region" && this.catalogs.size > 0) await this.wait(() => this.catalogs.size === 0);
  }

  /** Make exactly the wanted boxes ticked (a group the page keeps disabled and already right is skipped before this). */
  private async checkboxes(step: Step) {
    if (await this.held(step)) return;
    const values = Array.isArray(step.value) ? step.value : [step.value];
    let result = await js(this.page, "setChecks", step.componentId, values);
    for (let clicks = 0; result === "clicked" && clicks < 8; clicks++) { await this.page.waitForTimeout(400); result = await js(this.page, "setChecks", step.componentId, values); }
    if (result !== "ok") throw this.fail(`Could not set ${step.componentId} to ${JSON.stringify(step.value)} (${String(result)}).`, { field: step.componentId });
    if (!await this.wait(() => this.held(step))) throw this.fail(`${step.componentId} holds ${JSON.stringify(await this.formValue(step))} after choosing ${JSON.stringify(step.value)}.`, { field: step.componentId });
  }

  private async stepper(step: Step) {
    const ctl = await this.wait(() => js(this.page, "describe", step.componentId));
    if (!ctl) throw this.fail(`The form has no control ${step.componentId}.`, { field: step.componentId });
    const box = this.page.locator(`[id='${ctl.id}'] input:visible`).first();
    if (!await box.isVisible() && await this.held(step)) return; // e.g. the ELB IP count of a private load balancer
    try {
      await box.fill(numberText(step.value), { timeout: this.nativeTimeoutMs() });
      await box.press("Enter", { timeout: this.nativeTimeoutMs() });
      await box.blur({ timeout: this.nativeTimeoutMs() }); // a plain input (SFS capacity) only commits on blur
    } catch { throw this.fail(`Could not type into ${step.componentId}.`, { field: step.componentId }); }
    const shownNow = async () => { const kept = await this.formValue(step); return kept ?? await js(this.page, "readBack", step.componentId); }; // the form state is what the card is built from
    const same = async () => { const shown = Number(String(await shownNow()).replaceAll(",", "")); return Number.isFinite(shown) && shown === Number(step.value); };
    if (!await this.wait(same)) throw this.fail(`${step.componentId} shows ${JSON.stringify(await shownNow())} after typing ${JSON.stringify(step.value)}.`, { field: step.componentId });
  }

  private async add(step: Step) {
    const prefix = `${step.componentId}_|addible0|_`;
    const rows = async () => { const state = (await js(this.page, "formState")) ?? {}; const group = state.template_RENDER?.value?.[step.componentId] ?? {}; return Object.keys(group).filter(key => key.startsWith(prefix)).length; };
    const before = await rows();
    try { await this.page.click(`[id='${step.componentId}'] .common-addible-addDisk`, { timeout: this.nativeTimeoutMs() }); } // a pointer click: the add button ignores a DOM click()
    catch { throw this.fail(`The form has no add button for ${step.componentId}.`, { field: step.componentId }); }
    if (!await this.wait(async () => (await rows()) > before)) throw this.fail(`No new row appeared in ${step.componentId}.`, { field: step.componentId });
  }

  // ---- capture ----
  /** Wait until no catalog or rating request is in flight and no rating has finished for `quiet` seconds. */
  async settle() {
    const quiet = async () => { await this.checkInquiries(); return this.inflight === 0 && this.catalogs.size === 0 && this.clock() - this.lastActivity >= this.quiet; };
    if (!await this.wait(quiet)) throw this.fail("The price did not settle in time.", { step: "price" });
    await this.checkInquiries();
  }

  /** Settle, click Add to List and return the new cart item's card. */
  async capture(): Promise<Dict> {
    await this.settle();
    await js(this.page, "removeOverlays", OVERLAYS);
    const before: string[] = await js(this.page, "cartKeys");
    if (!await this.wait(async () => !await this.page.locator(ADD_TO_LIST).isDisabled())) throw this.fail("The page will not add this card: Add to List is disabled (an incomplete form, or a price of zero such as usage inside a free tier).", { step: "add_to_list" });
    try { await this.page.click(ADD_TO_LIST); } catch { throw this.fail("Could not click Add to List.", { step: "add_to_list" }); }
    const key = await this.wait(async () => newCartKey(before, await js(this.page, "cartKeys")));
    if (!key) throw this.fail("No card appeared in the price list after Add to List.", { step: "add_to_list" });
    const item = await js(this.page, "cartItem", key);
    if ((item.selectedProduct.productAllInfos as Dict[]).some(product => !product.inquiryResult)) throw this.fail("The card has unpriced products.", { step: "inquiry" });
    return cardFromCartItem(item);
  }
}
