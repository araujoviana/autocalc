/** Publish gate (ADR-0003): save a list, check it on the website's own terms, or delete it.
 *
 * Three checks per card: the list re-read anonymously and validated, the stored amount against a
 * fresh rating-engine price, and the amount the page recomputes in the card's Edit view.
 * Anything that fails, or cannot run, deletes the list and raises GATE_FAILED with no link.
 */
import { sharePayload, rateProducts } from "./cards.ts";
import { resolveExecutionTier } from "./compiler/circuit-breaker.ts";
import { CalculatorError } from "./errors.ts";
import { progress } from "./progress.ts";
import { shareLink } from "./endpoints.ts";
import { shareDetail } from "./lists.ts";
import type { ListSession } from "./lists.ts";
import type { EditResult } from "./page/edit.ts";
import { sameValue } from "./page/replay.ts";
import { addDecimal, cents, compareDecimal, formatCents, parseDecimal, roundCents, type Dec } from "./quote/decimal.ts";
import { validateList } from "./validate.ts";

type Dict = Record<string, any>;
type Rate = (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
const BILLING = { MONTHLY: "monthly", YEARLY: "yearly", ONDEMAND: "ondemand" } as const;
/** ADR-0010: reads, at most 4 in flight. */
export const RATING_WORKERS = 4;

export interface CardCheck { index: number; title: string; stored: Dec; rated: Dec | null; edit: Dec | null; problems: string[]; /** Set when a known portal defect made the Edit price untrustworthy and the rating-engine price stood in. */ edit_skipped?: string }
export const cardOk = (check: CardCheck) => !check.problems.length;
export function cardCheck(index: number, title: string, stored: Dec, extra: Partial<CardCheck> = {}): CardCheck {
  return { index, title, stored, rated: null, edit: null, problems: [], ...extra };
}
export function checkToJson(check: CardCheck) {
  const text = (value: Dec | null) => value === null ? null : formatCents(value);
  return { index: check.index, title: check.title, stored: formatCents(check.stored), rated: text(check.rated), edit: text(check.edit), problems: check.problems, ok: cardOk(check), ...(check.edit_skipped ? { edit_skipped: check.edit_skipped } : {}) };
}

/** The card's total, recomputed by the rating engine from its own stored products, in cents. */
export async function rerate(card: Dict, rate: Rate): Promise<Dec> {
  const selected = card.selectedProduct, products: Dict[] = structuredClone(selected.productAllInfos);
  if (selected.chargeModeName === "RI") throw new CalculatorError("VALIDATION", "RI cards cannot be verified with local price formulas.");
  const billing = BILLING[selected.chargeModeName as keyof typeof BILLING];
  if (!billing) throw new CalculatorError("VALIDATION", `Unknown charge mode ${String(selected.chargeModeName)}.`);
  await rateProducts(products, selected.region, billing, selected.periodNum || 1, selected.timeTag, rate);
  return roundCents(products.reduce((sum: Dec, product) => addDecimal(sum, parseDecimal(String(product.inquiryResult.amount))), { n: 0n, s: 0 }));
}

const title = (card: Dict) => card.selectedProduct?._customTitle || card.selectedProduct?.serviceCode || "card";

function requestMismatches(expected: unknown, stored: unknown, path: string): string[] {
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    if (stored === null || typeof stored !== "object" || Array.isArray(stored)) return [path];
    return Object.entries(expected).flatMap(([key, value]) => key in (stored as Dict) ? requestMismatches(value, (stored as Dict)[key], `${path}.${key}`) : [`${path}.${key}`]);
  }
  if (Array.isArray(expected) && expected.length && expected[0] !== null && typeof expected[0] === "object" && !Array.isArray(expected[0])) {
    if (!Array.isArray(stored) || stored.length !== expected.length) return [path];
    return expected.flatMap((left, index) => requestMismatches(left, stored[index], `${path}[${index}]`));
  }
  return sameValue(expected, stored) ? [] : [path];
}

/** Compare persisted form intent and purchase identity, excluding generated display/price metadata. */
export function requestIssues(expected: Dict, stored: Dict): string[] {
  const issues = requestMismatches(expected.rewriteValue ?? {}, stored.rewriteValue ?? {}, "rewriteValue");
  const requested = expected.selectedProduct ?? {}, pick = (source: Dict, keys: string[]) => Object.fromEntries(keys.filter(key => key in source).map(key => [key, source[key]]));
  issues.push(...requestMismatches(pick(requested, ["region", "chargeModeName", "periodNum", "timeTag", "purchaseNum"]), stored.selectedProduct ?? {}, "selectedProduct"));
  const keys = ["resourceSpecCode", "resourceType", "cloudServiceType", "productNum", "usageFactor", "usageValue", "usageMeasureId", "resourceSize"];
  issues.push(...requestMismatches((requested.productAllInfos ?? []).map((product: Dict) => pick(product, keys)), stored.selectedProduct?.productAllInfos ?? [], "products"));
  return issues.map(path => `saved card differs from the request at ${path}`);
}

async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const index = next++; results[index] = await work(items[index]!); } }));
  return results;
}

export interface VerifyDeps {
  reader: { getUncached(url: string): Promise<unknown> };
  edit: (listId: string) => Promise<EditResult[]>;
  rate: Rate;
  /** Replaces the rating-engine re-price (tests). */
  rerate?: (card: Dict) => Promise<Dec>;
}
export interface Verified { checks: CardCheck[]; issues: string[] }

/** Run the three checks on a saved list. Returns per-card results and list-level issues. */
export async function verify(listId: string, deps: VerifyDeps, expectedCards?: Dict[]): Promise<Verified> {
  const rate = deps.rerate ?? ((card: Dict) => rerate(card, deps.rate));
  const detail = await shareDetail(deps.reader, listId), cards = detail.cartListData as Dict[];
  const issues = validateList(detail as Dict).issues;
  if (!cards.length) issues.push("the saved list contains no cards");
  if (expectedCards && cards.length !== expectedCards.length) issues.push("the saved card count differs from the submitted request");
  const checks = cards.map((card, index) => cardCheck(index, title(card), cents(card.selectedProduct.amount)));
  if (expectedCards) checks.slice(0, expectedCards.length).forEach((check, index) => check.problems.push(...requestIssues(expectedCards[index]!, cards[check.index]!)));

  const rated = await mapLimit(cards, RATING_WORKERS, async (card): Promise<Dec | string> => {
    try { return await rate(card); } catch (error) { return `could not be re-priced: ${error instanceof Error ? error.message : String(error)}`; } // a card we cannot re-price is a failed card
  });
  checks.forEach((check, index) => {
    const value = rated[index]!;
    if (typeof value === "string") check.problems.push(value);
    else {
      check.rated = value;
      if (compareDecimal(value, check.stored) !== 0) check.problems.push(`rating engine prices the products at ${formatCents(value)}, stored ${formatCents(check.stored)}`);
    }
  });

  const editResults = await deps.edit(listId), indices = editResults.map(result => result.index);
  if (indices.length !== new Set(indices).size || indices.some(index => !(index >= 0 && index < cards.length && Number.isInteger(index)))) issues.push("the Edit check returned duplicate or unexpected card indices");
  const byIndex = new Map(editResults.map(result => [result.index, result]));
  for (const check of checks) {
    const result = byIndex.get(check.index);
    if (!result) { check.problems.push("the Edit check returned no result for this card"); continue; }
    check.edit = result.edit;
    const selected = cards[check.index]!.selectedProduct, billing = BILLING[selected.chargeModeName as keyof typeof BILLING] ?? "";
    const { tier, defect } = resolveExecutionTier(String(selected.serviceCode ?? ""), billing);
    // A known portal defect re-prices the card wrongly in Edit even though the card is right: the stored and rating-engine prices still must agree.
    if (!result.equal && result.edit !== null && tier === "RATING_VERIFIED_EDIT_SKIPPED" && defect) { check.edit_skipped = `${defect.advisory} (${defect.defectId})`; continue; }
    if (!result.equal) check.problems.push(result.reason || `Edit re-prices to ${result.edit === null ? "nothing" : formatCents(result.edit)}, stored ${formatCents(check.stored)}`);
  }
  // validation issues name the card by title in brackets
  for (const check of checks) check.problems.push(...issues.filter(issue => issue.startsWith(`[${check.title}]`)));
  return { checks, issues: issues.filter(issue => !checks.some(check => issue.startsWith(`[${check.title}]`))) };
}

export interface PublishOptions {
  settlement?: "total" | "monthly"; currency?: string;
  lists: Pick<ListSession, "create" | "delete"> & Partial<Pick<ListSession, "lists">>;
  check: (listId: string, expectedCards: Dict[]) => Promise<Verified>;
  env?: Record<string, string | undefined>;
}

const idsNamed = async (lists: PublishOptions["lists"], name: string): Promise<string[] | null> => {
  if (!lists.lists) return null;
  try { return ((await lists.lists()) as Dict[]).filter(list => list.name === name).map(list => String(list.key)); } catch { return null; }
};

/** Create the list. When the save's outcome is unknown, look for a list of that name that was not there before: exactly one is the one we made (the gate still verifies it). */
async function createOrFind(name: string, payload: Dict, lists: PublishOptions["lists"]): Promise<string> {
  const before = await idsNamed(lists, name);
  try { return await lists.create(payload); } catch (error) {
    if (!(error instanceof CalculatorError) || error.code !== "MUTATION_UNKNOWN" || before === null) throw error;
    const created = (await idsNamed(lists, name) ?? before).filter(id => !before.includes(id));
    if (created.length === 1) { progress(`The save reported an unknown outcome; found the new list ${created[0]}`); return created[0]!; }
    if (created.length === 0) throw new CalculatorError("MUTATION_UNKNOWN", `The save failed and no list named "${name}" was created.`, "It is safe to run the command again.", { created: [] });
    throw new CalculatorError("MUTATION_UNKNOWN", `The save reported an unknown outcome and ${created.length} new lists named "${name}" exist.`, "Delete the extra lists by hand, then run the command again.", { created });
  }
}

/** Save `cards` as a list, verify it, and return its link; on any failure delete it and throw GATE_FAILED. */
export async function publishChecked(name: string, cards: Dict[], options: PublishOptions) {
  if (!cards.length) throw new CalculatorError("VALIDATION", "Cannot publish an empty list.", undefined, { field: "cards" });
  const currency = options.currency ?? "USD", payload = sharePayload(name, cards as { selectedProduct: Dict }[], options.settlement);
  progress("Saving the list on your account");
  const listId = await createOrFind(name, payload, options.lists);
  progress(`Saved list ${listId}; checking stored, rated and Edit prices`);
  let checks: CardCheck[] = [], issues: string[] = [], error: string | null, cause: unknown;
  try {
    ({ checks, issues } = await options.check(listId, cards));
    const indices = checks.map(check => check.index);
    if (indices.length !== cards.length || new Set(indices).size !== cards.length || indices.some(index => !(index >= 0 && index < cards.length))) issues.push("the gate must return exactly one indexed check per submitted card");
    error = checks.every(cardOk) && !issues.length ? null : "the list did not pass the publish gate";
  } catch (thrown) { // fail closed: a check that cannot run is a failed check
    checks = []; issues = []; cause = thrown;
    error = `the publish gate could not run: ${thrown instanceof Error ? thrown.message : String(thrown)}`;
  }
  if (error === null) return { id: listId, url: shareLink(listId, currency), name, total_usd: payload.totalPrice.amount, checks: checks.map(checkToJson) };

  const kept = (options.env ?? process.env).AUTOCALC_KEEP_ON_FAIL === "1";
  let note = kept ? ` The list ${listId} was kept (AUTOCALC_KEEP_ON_FAIL=1).` : "";
  if (!kept) { try { await options.lists.delete(listId); } catch { note = ` It could not be deleted: delete list ${listId} by hand.`; } }
  const failure = new CalculatorError("GATE_FAILED", `${error}.${note}`, undefined,
    { cards: [...checks.map(checkToJson), ...issues.map(issue => ({ issue }))], list_id: kept || note ? listId : null });
  if (cause !== undefined) failure.cause = cause;
  throw failure;
}
