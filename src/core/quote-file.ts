/** Declarative quotes (ADR-0018): a YAML file of cards, validated offline against the service schemas,
 * planned without touching the website, applied through the publish gate. */
import { readFile, writeFile } from "node:fs/promises";
import { CalculatorError } from "./errors.ts";
import { formatDecimal } from "./quote/decimal.ts";
import { invalid } from "./quote/model.ts";
import { rank } from "./quote/ranking.ts";
import { publishQuoteTool } from "./publish.ts";
import { loadService } from "./schema-model.ts";
import { legalOptions, modesOf, SPEC_ARG, VERIFIED } from "./services/publication.ts";
import { draftQuoteTool } from "./workflow.ts";
import { compileQuote, buildCanonicalQuoteIR, generateLockfile, stringifyLockfile, sanitizeTitle, type QuoteDocument } from "./compiler/index.ts";
import type { ActionContext } from "./types.ts";
import { progress } from "./progress.ts";
import { ECS_DEFAULT_IMAGE } from "./schemas.ts";
import { imageLabel, matchImages } from "./services/ecs.ts";

type Dict = Record<string, any>;
const CARD_FIELDS = ["id", "service", "region", "billing", "quantity", "needs", "spec", "options"];
export const SCHEMA_HINT = "Read the autocalc://schema/<service> resource, or run `autocalc schema coverage <service>`.";
const isObject = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);

export interface Quote { customer: string; cards: Dict[]; name?: string | undefined; settlement: string; path?: string | undefined; version?: string | undefined; rawDocument?: QuoteDocument | undefined }

export function parse(text: string, path?: string): Quote {
  let doc: unknown;
  try { doc = Bun.YAML.parse(text); } catch (error) { throw invalid(`The quote file is not valid YAML: ${error instanceof Error ? error.message : String(error)}`, "cards"); }
  if (isObject(doc) && doc.version === "1") {
    const compiled = compileQuote(text);
    const cards = compiled.resources.map(r => ({
      id: r.id,
      service: r.service,
      region: r.region,
      billing: r.billing,
      quantity: r.quantity,
      needs: r.needs,
      spec: r.spec,
      options: r.options,
    }));
    return {
      customer: compiled.document.metadata.customer,
      cards,
      name: compiled.document.metadata.title_prefix,
      settlement: "total",
      path,
      version: "1",
      rawDocument: compiled.document,
    };
  }
  if (!isObject(doc) || !Array.isArray(doc.cards) || !doc.cards.length) throw invalid("A quote file needs a customer and a nonempty list of cards.", "cards");
  const defaults = doc.defaults ?? {};
  if (!isObject(defaults)) throw invalid("defaults must be a mapping.", "defaults");
  const unknown = Object.keys(defaults).filter(k => k !== "region" && k !== "billing").sort();
  if (unknown.length) throw invalid(`defaults has no field '${unknown[0]}'.`, unknown[0], ["region", "billing"]);
  if (!doc.cards.every(isObject)) throw invalid("Each card must be an object.", "cards");
  return { customer: typeof doc.customer === "string" ? doc.customer : "", cards: doc.cards.map(card => ({ ...defaults, ...card })),
    name: typeof doc.name === "string" ? doc.name : undefined, settlement: String(doc.settlement ?? "total"), path };
}

export async function load(path: string): Promise<Quote> {
  let text: string;
  try { text = await readFile(path, "utf8"); } catch { throw invalid(`Cannot read the quote file '${path}'.`, "path"); }
  return parse(text, path);
}

const g = (v: number | null | undefined) => v == null ? "" : String(v);

/** Offline: no browser, no network. Every error names the card and field and the legal values. */
export async function validate(quote: Quote, dir?: string): Promise<Dict[]> {
  const errors: Dict[] = [];
  const bad = (card: Dict, field: string, error: string, extra: Dict = {}) => errors.push({ card: card.id ?? null, field, error, ...extra });
  if (!quote.customer.trim()) errors.push({ card: null, field: "customer", error: "customer is required." });
  for (const card of quote.cards) {
    for (const name of ["id", "service", "region", "billing"]) if (!card[name]) bad(card, name, `${name} is required (a card or the file's defaults must set it).`);
    const unknown = Object.keys(card).filter(k => !CARD_FIELDS.includes(k)).sort();
    if (unknown.length) bad(card, unknown[0]!, `Unknown card field '${unknown[0]}'.`, { allowed: [...CARD_FIELDS].sort() });
    const service = String(card.service ?? "").toLowerCase();
    const legal = VERIFIED.has(service) ? legalOptions(service) : null;
    if (!legal) { bad(card, "service", `No service '${service}'.`, { allowed: [...VERIFIED].sort() }); continue; }
    const modes = modesOf(service);
    if (card.billing && !modes.includes(card.billing)) bad(card, "billing", `${service} does not support '${card.billing}'.`, { allowed: modes });
    if (!card.spec && !card.needs && SPEC_ARG[service]) bad(card, "spec", "Give the size (`needs`) or a specific `spec`.", { hint: "needs: {vcpus: 4, memory_gb: 16}" });
    if (card.options != null && !isObject(card.options)) { bad(card, "options", "options must be a mapping of option name to value.", { allowed: legal }); continue; }
    const controls = new Map((await loadService(service, dir))?.controls.filter(c => c.option).map(c => [c.option!, c]) ?? []);
    for (const [option, value] of Object.entries(card.options ?? {})) {
      if (!legal.includes(option)) { bad(card, option, `${service} has no option '${option}'.`, { allowed: legal, hint: SCHEMA_HINT }); continue; }
      if (typeof value !== "number") continue;
      for (const r of controls.get(option)?.ranges.filter(range => range.when == null) ?? [])
        if ((r.min != null && value < r.min) || (r.max != null && value > r.max))
          bad(card, option, `${value} is outside the range ${g(r.min)}..${g(r.max)} ${r.unit ?? ""}`.trim(), { range: { min: r.min ?? null, max: r.max ?? null, step: r.step }, hint: SCHEMA_HINT });
    }
  }
  return errors;
}

/** Options the card sets that no control in the service's schema maps. */
export async function unmappedOptions(card: Dict, dir?: string): Promise<string[]> {
  const mapped = new Set((await loadService(String(card.service).toLowerCase(), dir))?.controls.map(c => c.option).filter(Boolean));
  return Object.keys(card.options ?? {}).filter(option => !mapped.has(option)).sort();
}

const lockPath = (quote: Quote) => quote.path?.replace(/\.[^./\\]+$/, "") + ".lock.json";
async function readLock(quote: Quote): Promise<Dict> {
  if (!quote.path) return {};
  let text: string;
  try { text = await readFile(lockPath(quote), "utf8"); } catch { return {}; }
  try { const lock = JSON.parse(text); if (isObject(lock)) return lock; } catch { /* reported below */ }
  throw invalid(`The lock file ${lockPath(quote)} is not valid JSON; fix or delete it.`, "lock"); // never silently replace a pin
}

async function raiseIfInvalid(quote: Quote, dir?: string) {
  const ids = quote.cards.map(card => card.id), duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate !== undefined) throw invalid(`Card ids must be unique; '${duplicate}' repeats.`, "id");
  const errors = await validate(quote, dir);
  if (!errors.length) return;
  const first = errors[0]!, legal = first.allowed ?? first.range;
  throw new CalculatorError("VALIDATION", `Card '${first.card}': ${first.error}`,
    (legal ? `Legal ${first.field}: ${JSON.stringify(legal)}. ` : "") + SCHEMA_HINT, { field: first.field, ...(first.allowed ? { allowed: first.allowed } : {}), errors });
}

const sameNeeds = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a ?? {})) === JSON.stringify(sortKeys(b ?? {}));

/** Validate, resolve through the ranking, rate. Saves nothing on the website; writes the lock file. */
/** Catalog images a card's image request cannot tell apart; empty when it names exactly one. */
async function ambiguousImages(ctx: ActionContext, region: string, spec: string, image: unknown): Promise<string[]> {
  const info = await ctx.catalog.productInfo("ecs", region);
  const matched = matchImages(info.product["ec2_vm.image.special"] ?? [], spec.split(".")[0]!, typeof image === "string" && image ? image : ECS_DEFAULT_IMAGE);
  return matched.length > 1 ? matched.map(imageLabel) : [];
}

export async function plan(ctx: ActionContext, quote: Quote, dir?: string) {
  await raiseIfInvalid(quote, dir);
  const lock = await readLock(quote);
  // a pin applies only to the request it was made for: a changed `needs` is a new question
  const pins = (card: Dict) => { const pin = lock[card.id]; return pin && !card.spec && sameNeeds(pin.needs, card.needs) ? pin : undefined; };
  const view = await draftQuoteTool(ctx, { customer: quote.customer, requirements: quote.cards.map(card => ({ ...card, ...(pins(card) ? { spec: pins(card).spec } : {}) })) });
  const draft = await ctx.drafts.load(view.draft_id);
  const decided = new Map(draft.decisions.map(d => [d.requirement_id, d]));
  const rows: Dict[] = [], next: Dict = { ...lock };
  for (const [index, card] of quote.cards.entries()) {
    const requirement = draft.requirements[index]!, row: Dict = { id: card.id, unmapped_options: await unmappedOptions(card, dir) }, decision = decided.get(requirement.id);
    if (decision) {
      const ranked = rank(requirement, await ctx.provider.candidates(requirement)).find(x => x.candidate.spec === decision.spec);
      const price = ranked ? formatDecimal(ranked.candidate.price) : null;
      Object.assign(row, { spec: decision.spec, price });
      if (requirement.service.toLowerCase() === "ecs") {
        const choices = await ambiguousImages(ctx, requirement.region, decision.spec, requirement.options.image);
        if (choices.length) row.image_choices = choices;
      }
      const pin = pins(card);
      if (pin && pin.price !== price) row.lock_drift = { locked_price: pin.price, price };
      else if (!lock[card.id]) next[card.id] = { spec: decision.spec, price, needs: card.needs ?? {} };
    } else row.candidates = view.requirements.find(r => r.id === requirement.id)?.candidates;
    rows.push(row);
  }
  if (quote.path && JSON.stringify(next) !== JSON.stringify(lock)) await writeFile(lockPath(quote), JSON.stringify(sortKeys(next), null, 2) + "\n", "utf8");
  if (quote.version === "1" && quote.path) {
    try {
      const text = await readFile(quote.path, "utf8");
      const compiled = compileQuote(text);
      const ir = buildCanonicalQuoteIR(compiled.document, compiled.resources);
      for (const [index, card] of quote.cards.entries()) {
        const row = rows[index];
        if (row && ir.resources[index]) {
          if (row.spec) {
            ir.resources[index].spec = row.spec;
            ir.resources[index].skuCode = row.spec;
          }
          if (row.price != null) {
            const p = parseFloat(String(row.price));
            ir.resources[index].unitPrice = p;
            ir.resources[index].totalPrice = p * (card.quantity ?? 1);
          }
        }
      }
      const lockObj = generateLockfile(ir);
      const lockYamlPath = quote.path.replace(/\.[^./\\]+$/, "") + ".lock.yaml";
      await writeFile(lockYamlPath, stringifyLockfile(lockObj), "utf8");
    } catch {
      // Non-fatal if lockfile write fails
    }
  }
  return { draft_id: view.draft_id, cards: rows, pending: view.pending };
}

const sortKeys = (v: any): any => Array.isArray(v) ? v.map(sortKeys) : isObject(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;

/** Plan, then publish through the fail-closed gate. Refuses unresolved cards and unmapped options. */
export async function apply(ctx: ActionContext, quote: Quote, name?: string, dir?: string) {
  const result = await plan(ctx, quote, dir);
  if (result.pending.length) throw invalid(`Card '${result.pending[0]}' is unresolved; choose a spec with \`spec:\` in the file.`, "spec", result.pending);
  for (const row of result.cards) {
    if (row.unmapped_options.length) throw invalid(`Card '${row.id}' sets options the schema does not map: ${JSON.stringify(row.unmapped_options)}.`, row.unmapped_options[0], undefined, SCHEMA_HINT);
    if (row.lock_drift) throw invalid(`Card '${row.id}' changed price since the lock was written; review and delete its lock entry to accept.`, "spec", [row.lock_drift.price]);
  }
  for (const row of result.cards) {
    if (Array.isArray(row.image_choices) && row.image_choices.length) throw invalid(`Card '${row.id}' matches several images: ${row.image_choices.join("; ")}.`, "image", row.image_choices, "Set options.image to one exact name.");
  }
  const rawTitle = name || quote.name;
  if (!rawTitle) throw invalid("A list name is required (`name:` in the file).", "name");
  const title = quote.version === "1" ? sanitizeTitle(rawTitle) : rawTitle;
  if (quote.settlement !== "total" && quote.settlement !== "monthly") throw invalid("settlement must be 'total' or 'monthly'.", "settlement", ["total", "monthly"]);
  progress(`Planned ${result.cards.length} card${result.cards.length === 1 ? "" : "s"}`);
  let existing: Dict[] = [];
  try { existing = (await ctx.lists.lists()) as Dict[]; } catch { /* the publish path checks the login itself */ }
  const same = existing.filter(list => list.name === title);
  const duplicate = same.length ? `A list named "${title}" already exists (id ${String(same[0]!.key)}); this creates another.` : null;
  const published = await publishQuoteTool(ctx, { draft_id: result.draft_id, name: title, settlement: quote.settlement, currency: "USD" });
  return duplicate ? { ...published, warnings: [...((published as Dict).warnings ?? []), duplicate] } : published;
}
