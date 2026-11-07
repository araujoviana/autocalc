/** Declarative quotes (ADR-0018): a YAML file of cards, validated offline against the service schemas,
 * planned without touching the website, applied through the publish gate. */
import { readFile, writeFile } from "node:fs/promises";
import { CalculatorError } from "./errors.ts";
import { formatDecimal } from "./quote/decimal.ts";
import { invalid } from "./quote/model.ts";
import { rank } from "./quote/ranking.ts";
import { publishQuoteTool } from "./publish.ts";
import { loadService } from "./schema-model.ts";
import { legalOptions, modesOf, PRIMARY_GROUP, SPEC_ARG, SPEC_RULES, USAGE_PRICED, VERIFIED } from "./services/publication.ts";
import { draftQuoteTool } from "./workflow.ts";
import { compileQuote, detectCatalogPricingAnomalies, buildCanonicalQuoteIR, generateLockfile, stringifyLockfile, sanitizeTitle, normalizeResourceToCards, type QuoteDocument } from "./compiler/index.ts";
import type { ActionContext } from "./types.ts";
import { progress } from "./progress.ts";
import { CardInput, ECS_DEFAULT_IMAGE } from "./schemas.ts";
import { RECIPES } from "./services/forms.ts";
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
    const cards = compiled.resources.flatMap(r =>
      normalizeResourceToCards(r, compiled.document.horizon?.billing_policy)
    );
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
    if (!(service in RECIPES) && card.region && card.billing && modes.includes(card.billing)) {
      // builder options are checked offline with the builder's own input schema, so a bad value fails here and not after minutes of browser work
      const parsed = CardInput.safeParse({ service, region: card.region, billing: card.billing, ...(card.quantity && card.quantity !== 1 ? { quantity: card.quantity } : {}), ...card.options });
      if (!parsed.success) for (const issue of parsed.error.issues) if (issue.code !== "unrecognized_keys" && issue.path[0] !== "service" && issue.path[0] !== "billing" && issue.path[0] !== SPEC_ARG[service]) bad(card, String(issue.path[0] ?? "options"), `${issue.path.join(".") || "options"}: ${issue.message}.`);
    }
    const controls = new Map((await loadService(service, dir))?.controls.filter(c => c.option).map(c => [c.option!, c]) ?? []);
    for (const [option, value] of Object.entries(card.options ?? {})) {
      if (!legal.includes(option)) { bad(card, option, `${service} has no option '${option}'.`, { allowed: legal, hint: SCHEMA_HINT }); continue; }
      if (typeof value !== "number") continue;
      const unconditionalRanges = (controls.get(option)?.ranges.some(range => range.when != null) ? [] : controls.get(option)?.ranges.filter(range => range.min !== range.max)) /* a control whose ranges depend on page state has no single limit */ /* min = max is the page default of a state-dependent control, not a limit */ ?? [];
      if (unconditionalRanges.length && unconditionalRanges.every(r => (r.min != null && value < r.min) || (r.max != null && value > r.max))) {
        const r = unconditionalRanges[0]!;
        bad(card, option, `${value} is outside the range ${g(r.min)}..${g(r.max)} ${r.unit ?? ""}`.trim(), { range: { min: r.min ?? null, max: r.max ?? null, step: r.step }, hint: SCHEMA_HINT });
      }
    }
  }
  return errors;
}

/** Options the card sets that no control in the service's schema maps. */
export async function unmappedOptions(card: Dict, dir?: string): Promise<string[]> {
  const service = String(card.service).toLowerCase();
  // An option is applied when a schema control names it or the service's builder takes it (publish builds the card from the builder's own input, which rejects anything else).
  const mapped = new Set<string | null | undefined>([...((await loadService(service, dir))?.controls.map(c => c.option).filter(Boolean) ?? []), ...(legalOptions(service) ?? [])]);
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
  const view = await draftQuoteTool(ctx, { customer: quote.customer, requirements: quote.cards.map(card => ({ ...card, ...(!card.group && PRIMARY_GROUP[card.service.toLowerCase()] ? { group: PRIMARY_GROUP[card.service.toLowerCase()] } : {}), ...(pins(card) ? { spec: pins(card).spec } : {}) })) });
  const draft = await ctx.drafts.load(view.draft_id);
  const decided = new Map(draft.decisions.map(d => [d.requirement_id, d]));
  const rows: Dict[] = [], next: Dict = { ...lock };
  for (const [index, card] of quote.cards.entries()) {
    const requirement = draft.requirements[index]!, row: Dict = { id: card.id, unmapped_options: await unmappedOptions(card, dir) }, decision = decided.get(requirement.id);
    if (decision) {
      const ranked = rank(requirement, await ctx.provider.candidates(requirement)).find(x => x.candidate.spec === decision.spec);
      const price = ranked && !USAGE_PRICED.has(requirement.service.toLowerCase()) ? formatDecimal(ranked.candidate.price) : null;
      Object.assign(row, { spec: decision.spec, price });
      if (USAGE_PRICED.has(requirement.service.toLowerCase())) row.price_note = "priced by usage: no list price at plan time, so the total is incomplete until the list is rated (apply-quote)";
      const conflict = SPEC_RULES[requirement.service.toLowerCase()]?.(decision.spec, requirement.options);
      if (conflict) row.spec_problem = conflict;
      if (requirement.service.toLowerCase() === "ecs") {
        const choices = await ambiguousImages(ctx, requirement.region, decision.spec, requirement.options.image);
        if (choices.length) row.image_choices = choices;
      }
      if (requirement.billing === "yearly" && ctx.provider.prices) {
        const known = await ctx.provider.prices(requirement, decision.spec), monthly = known?.monthly ?? (known?.ondemand !== undefined ? known.ondemand * 730 : undefined);
        const [anomaly] = known ? detectCatalogPricingAnomalies([{ id: card.id, service: requirement.service, yearlyAmount: known.yearly, monthlyAmount: monthly }]) : [];
        if (anomaly) row.price_anomaly = anomaly.warning;
      }
      const pin = pins(card);
      if (pin && pin.price !== price) row.lock_drift = { locked_price: pin.price, price };
      else if (!lock[card.id]) next[card.id] = { spec: decision.spec, price, needs: card.needs ?? {} };
    } else {
      row.candidates = view.requirements.find(r => r.id === requirement.id)?.candidates;
      if (requirement.spec) row.spec_not_found = requirement.spec;
      const options = (row.candidates as Dict[] | undefined ?? []).slice(0, 5).map(c => c.spec).join(", ");
      row.message = requirement.spec
        ? `spec '${requirement.spec}' is not sold for ${requirement.service} in ${requirement.region} (${requirement.billing}); closest: ${options || "none"}`
        : `${requirement.service} needs an explicit spec: add \`spec:\` to the card${options ? ` (candidates: ${options})` : ""}`;
    }
    rows.push(row);
  }
  if (quote.path && JSON.stringify(next) !== JSON.stringify(lock)) await writeFile(lockPath(quote), JSON.stringify(sortKeys(next), null, 2) + "\n", "utf8");
  if (quote.version === "1" && quote.path) {
    try {
      const text = await readFile(quote.path, "utf8");
      const compiled = compileQuote(text);
      const ir = buildCanonicalQuoteIR(compiled.document, compiled.resources);
      const rowById = new Map(rows.map((r, idx) => [String(r.id), { row: r, card: quote.cards[idx]! }]));
      for (const irRes of ir.resources) {
        let resTotal = 0;
        for (const physical of irRes.physicalCards) {
          const matched = rowById.get(physical.title);
          if (!matched) continue;
          const { row, card } = matched;
          if (row.spec && !irRes.skuCode) {
            irRes.spec = row.spec;
            irRes.skuCode = row.spec;
          }
          if (row.price != null) {
            const p = parseFloat(String(row.price));
            if (!irRes.unitPrice) irRes.unitPrice = p;
            physical.unitAmount = p;
            physical.totalAmount = p * (card.quantity ?? physical.quantity ?? 1);
            resTotal += physical.totalAmount;
          }
        }
        irRes.totalPrice = resTotal;
      }
      // the SKU list prices of the planned resources; disks and other add-ons are priced when the list is published
      ir.totalAmount = ir.resources.reduce((sum, resource) => sum + (resource.totalPrice ?? 0), 0);
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
    if (row.spec_problem) throw invalid(`Card '${row.id}': ${row.spec_problem}`, "spec", undefined, "Choose a spec this service can take with these options.");
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
  const anomalies = result.cards.filter(row => row.price_anomaly).map(row => `Card "${row.id}": ${row.price_anomaly}`);
  const skipped = (((published as Dict).checks ?? []) as Dict[]).filter(check => check.edit_skipped).map(check => `Card "${check.title}": Edit check skipped for a known portal defect. ${check.edit_skipped}`);
  const warnings = [...((published as Dict).warnings ?? []), ...(duplicate ? [duplicate] : []), ...anomalies, ...skipped];
  return warnings.length ? { ...published, warnings } : published;
}
