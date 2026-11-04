/** Check a saved list's Edit prices on the calculator page itself (ADR-0003, design D6).
 *
 * For each card: open the share link anonymously, copy the list into the page's cart (View
 * Details), open the card's Edit view, let the page re-price it from the stored form state, and
 * Save it back to the cart, where the re-priced amount becomes readable. A card passes only when
 * the form's final state matches the stored one (the page's own rule) and the amounts are equal
 * to the cent. Per-card failures are reported, never thrown.
 */
import type { BrowserManager } from "../browser.ts";
import { CalculatorError } from "../errors.ts";
import { shareLink } from "../endpoints.ts";
import { shareDetail } from "../lists.ts";
import { cents, compareDecimal, type Dec } from "../quote/decimal.ts";
import { asPageLike, Driver, type DriverOptions, type PageLike } from "./driver.ts";
import { OVERLAYS, js, rewriteMismatches } from "./store.ts";

type Dict = Record<string, any>;
const CARD_BUTTON = (key: string) => `[data-autocalc-card='${key}'] button`;
const WARNING_DIALOG = "[closeactionname=rewriteError_close]";

export interface EditResult {
  index: number; stored: Dec; edit: Dec | null; equal: boolean;
  reason?: string | undefined;
  /** The page showed its "No data matched…" dialog (informational). */
  warning?: boolean | undefined;
}

/** What the Edit check touches beyond the driver's slice of a Playwright page. */
interface Control { click(options?: Dict): Promise<unknown>; isVisible(): Promise<boolean>; first(): Control }
interface EditPage extends PageLike { locator(selector: string, options?: Dict): any; getByRole(role: string, options?: Dict): Control; keyboard: { press(key: string): Promise<unknown> } }
const raw = (driver: Driver) => driver.page as EditPage;
const button = (driver: Driver, key: string, label: string): Control => raw(driver).locator(CARD_BUTTON(key), { hasText: label }).first();

/** Close the page's "No data matched…" dialog if it is open; true if it was. */
async function closeWarning(driver: Driver): Promise<boolean> {
  const page = raw(driver);
  if (!await (page.locator(WARNING_DIALOG) as Control).isVisible()) return false;
  try { await page.locator(`${WARNING_DIALOG} button.tiny-dialog-box__headerbtn`).first().click({ timeout: 3000 }); }
  catch { await page.keyboard.press("Escape"); }
  await js(driver.page, "removeOverlays", ".v-modal"); // the dialog leaves its mask behind, blocking clicks
  return true;
}

/** Click a card's button, clearing masks and the warning dialog between tries until the deadline. */
async function click(driver: Driver, key: string, label: string): Promise<{ clicked: boolean; warned: boolean }> {
  let warned = false;
  const attempt = async () => {
    warned = await closeWarning(driver) || warned;
    await js(driver.page, "removeOverlays", OVERLAYS);
    try { await button(driver, key, label).click({ timeout: 2000 }); return true; } catch { return false; }
  };
  return { clicked: !!await driver.wait(attempt), warned };
}

/** Edit one card already in the page's cart and compare the re-priced amount with the stored one. */
export async function checkCard(driver: Driver, index: number, card: Dict): Promise<EditResult> {
  driver.service = card.selectedProduct?.serviceCode || "shared-list";
  const page = driver.page, stored = cents(card.selectedProduct.amount), key: string | undefined = card.selectedProduct._cartId;
  let warning = false;
  const failed = async (reason: string, editing = true): Promise<EditResult> => {
    if (editing) { // leave edit mode so the next card's Edit button works
      try { await closeWarning(driver); await button(driver, String(key), "Cancel").click({ timeout: 3000 }); } catch { /* best effort */ }
    }
    return { index, stored, edit: null, equal: false, reason, warning };
  };

  const before = key ? await js(page, "cartSummary", key) : null;
  if (!before || !await js(page, "tagCard", key)) return failed("the card is not in the page's price list after View Details", false);
  driver.mark();
  const edit = await click(driver, key!, "Edit");
  warning = edit.warned;
  if (!edit.clicked) return failed("the Edit button did not respond", false);
  if (!await driver.wait(async () => (await js(page, "editState"))?.cartId === key)) return failed("the Edit view did not open");

  // The page refills the form in stages (region, catalog, each control). Wait until it holds
  // the stored form state, by the page's own comparison rule, before trusting the price.
  const converged = async () => {
    warning = await (raw(driver).locator(WARNING_DIALOG) as Control).isVisible() || warning;
    const current = (await js(page, "editState"))?.current;
    return current != null && !rewriteMismatches(card.rewriteValue, current).length;
  };
  if (!await driver.wait(converged)) {
    const current = (await js(page, "editState"))?.current, mismatches = rewriteMismatches(card.rewriteValue, current);
    return failed("the form state differs after Edit: " + (mismatches.length ? mismatches : ["no form state"]).join(", "));
  }
  driver.mark(); // the refill passes through states the page cannot price; only the final one counts
  try { await driver.settle(); }
  catch (error) { if (error instanceof CalculatorError && error.code === "PAGE_ENCODE_FAILED") return failed(`the Edit view did not re-price: ${error.message}`); throw error; }
  // The dialog can open at any time during the refill and blocks clicks; click() closes it.
  const save = await click(driver, key!, "Save");
  warning = save.warned || warning;
  if (!save.clicked) return failed("the Save button did not respond");
  const after = await driver.wait(async () => { const summary = await js(page, "cartSummary", key); return summary && summary.timeTag !== before.timeTag && summary; });
  if (!after) return failed("the re-priced card was not saved back to the price list");
  const products: unknown[] = (await js(page, "cartItem", key))?.selectedProduct?.productAllInfos ?? [];
  if (!products.length || products.some(product => !(product as Dict | null)?.inquiryResult)) return { index, stored, edit: null, equal: false, reason: "the re-priced card has unpriced products", warning };
  const repriced = cents(after.amount);
  if (compareDecimal(repriced, stored) !== 0) return { index, stored, edit: repriced, equal: false, reason: undefined, warning };
  return { index, stored, edit: repriced, equal: true, reason: undefined, warning };
}

export interface EditCheckOptions { driver?: DriverOptions; makeDriver?: (page: PageLike, service: string, options: DriverOptions) => Driver }

/** One result per card of the saved list, in list order. Throws only if the list cannot be read. */
export async function editCheck(reader: { getUncached(url: string): Promise<unknown> }, manager: BrowserManager, listId: string, options: EditCheckOptions = {}): Promise<EditResult[]> {
  const cards = (await shareDetail(reader, listId)).cartListData as Dict[];
  return manager.withAnonymousContext(async context => {
    const page = asPageLike(await context.newPage() as never), driver = (options.makeDriver ?? ((p, s, o) => new Driver(p, s, o)))(page, "shared-list", options.driver ?? {});
    try {
      await driver.open(shareLink(listId));
      await driver.settle();
      await js(page, "removeOverlays", OVERLAYS);
      await (page as EditPage).getByRole("button", { name: "View Details" }).click({ timeout: driver.timeout * 1000 });
    } catch (error) {
      const reason = error instanceof CalculatorError && error.code === "PAGE_ENCODE_FAILED" ? error.message : "the shared list did not open";
      return cards.map((card, index): EditResult => ({ index, stored: cents(card.selectedProduct.amount), edit: null, equal: false, reason }));
    }
    const results: EditResult[] = [];
    for (const [index, card] of cards.entries()) results.push(await checkCard(driver, index, card));
    return results;
  }, { lean: true });
}
