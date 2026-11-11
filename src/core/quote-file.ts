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
import { compileQuote, detectCatalogPricingAnomalies, buildCanonicalQuoteIR, generateLockfile, stringifyLockfile, parseLockfile, sanitizeTitle, normalizeResourceToCards, partitionResources, type QuoteDocument, type ShardPartition, type LockedShard, type CanonicalResourceIR, MAX_LIST_CARDS, MAX_LIST_BYTES } from "./compiler/index.ts";
import type { ActionContext } from "./types.ts";
import { progress } from "./progress.ts";
import { CardInput, ECS_DEFAULT_IMAGE } from "./schemas.ts";
import { RECIPES } from "./services/forms.ts";
import { imageLabel, matchImages } from "./services/ecs.ts";

type Dict = Record<string, any>;
const CARD_FIELDS = ["id", "service", "region", "billing", "quantity", "needs", "spec", "options"];
export const SCHEMA_HINT = "Read the autocalc://schema/<service> resource, or run `autocalc schema coverage <service>`.";
const isObject = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);

export interface Quote { customer: string; cards: Dict[]; name?: string | undefined; settlement: string; path?: string | undefined; version?: string | undefined; rawDocument?: QuoteDocument | undefined; compiledResources?: any[] | undefined }

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
      compiledResources: compiled.resources,
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
  try { text = await readFile(path, "utf8"); } catch { throw invalid(`Cannot read the quote file '${path}'.`, "path", undefined, "Verify that the file path is correct and the file exists, or create a quote.yaml file."); }
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
  const legalStr = Array.isArray(legal) ? legal.join(", ") : isObject(legal) ? `${g(legal.min)}..${g(legal.max)}` : "";
  throw new CalculatorError("VALIDATION", `Card '${first.card}': ${first.error}`,
    (legalStr ? `Legal ${first.field}: ${legalStr}. ` : "") + SCHEMA_HINT, { field: first.field, ...(first.allowed ? { allowed: first.allowed } : {}), errors });
}

const sameNeeds = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a ?? {})) === JSON.stringify(sortKeys(b ?? {}));

/** Validate, resolve through the ranking, rate. Saves nothing on the website; writes the lock file. */
/** Catalog images a card's image request cannot tell apart; empty when it names exactly one. */
async function ambiguousImages(ctx: ActionContext, region: string, spec: string, image: unknown): Promise<string[]> {
  const info = await ctx.catalog.productInfo("ecs", region);
  const matched = matchImages(info.product["ec2_vm.image.special"] ?? [], spec.split(".")[0]!, typeof image === "string" && image ? image : ECS_DEFAULT_IMAGE);
  return matched.length > 1 ? matched.map(imageLabel) : [];
}

function primaryGroupFor(card: Dict): string | undefined {
  if (card.group) return card.group;
  const svc = card.service.toLowerCase();
  if (svc === "elb" && (card.spec?.startsWith("elbv3") || card.options?.type === "dedicated")) return "elb_elbv3";
  return PRIMARY_GROUP[svc];
}

export async function plan(ctx: ActionContext, quote: Quote, dir?: string) {
  await raiseIfInvalid(quote, dir);
  const lock = await readLock(quote);
  // a pin applies only to the request it was made for: a changed `needs` is a new question
  const pins = (card: Dict) => { const pin = lock[card.id]; return pin && !card.spec && sameNeeds(pin.needs, card.needs) ? pin : undefined; };
  const view = await draftQuoteTool(ctx, { customer: quote.customer, requirements: quote.cards.map(card => ({ ...card, ...(primaryGroupFor(card) ? { group: primaryGroupFor(card) } : {}), ...(pins(card) ? { spec: pins(card).spec } : {}) })) });
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
  let shards: ShardPartition[] | undefined = undefined;
  if (quote.version === "1") {
    try {
      let compiled: { document: any; resources: any[] } | null = null;
      if (quote.path) {
        try {
          const text = await readFile(quote.path, "utf8");
          compiled = compileQuote(text);
        } catch {
          // fallback to in-memory parsed resources
        }
      }
      if (!compiled && quote.rawDocument && quote.compiledResources) {
        compiled = { document: quote.rawDocument, resources: quote.compiledResources };
      }
      if (compiled) {
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

        const titlePrefix = quote.name || compiled.document.metadata?.title_prefix || "Quote";
        shards = partitionResources(ir.resources, titlePrefix);

        const lockedShards: LockedShard[] = shards.map(s => ({
          index: s.index,
          title: s.title,
          card_count: s.cardCount,
          estimated_bytes: s.estimatedBytes,
        }));

        const lockObj = generateLockfile(ir, undefined, lockedShards);
        if (quote.path) {
          const lockYamlPath = quote.path.replace(/\.[^./\\]+$/, "") + ".lock.yaml";
          await writeFile(lockYamlPath, stringifyLockfile(lockObj), "utf8");
        }
      }
    } catch {
      // Non-fatal if lockfile write fails
    }
  } else if (quote.cards.length > MAX_LIST_CARDS) {
    const pseudoResources: CanonicalResourceIR[] = quote.cards.map((c, i) => ({
      id: String(c.id ?? `card-${i}`),
      service: String(c.service || "custom"),
      region: String(c.region || "default"),
      availability: (c.availability === "multi-az" ? "multi-az" : "single-az") as "single-az" | "multi-az",
      billing: String(c.billing || "monthly"),
      quantity: Number(c.quantity ?? 1),
      physicalCards: [{
        cardIndex: i,
        cardId: `${c.id ?? `card-${i}`}-0`,
        title: String(c.id ?? `card-${i}`),
        options: c.options ?? {},
        quantity: Number(c.quantity ?? 1),
        unitAmount: 0,
        totalAmount: 0,
      }],
    }));
    shards = partitionResources(pseudoResources, quote.name || "Quote");
  }
  return { draft_id: view.draft_id, cards: rows, pending: view.pending, ...(shards ? { shards } : {}) };
}

const sortKeys = (v: any): any => Array.isArray(v) ? v.map(sortKeys) : isObject(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;

/** Plan, then publish through the fail-closed gate. Refuses unresolved cards and unmapped options. */
export async function apply(ctx: ActionContext, quote: Quote, name?: string, dir?: string): Promise<Dict> {
  const result = await plan(ctx, quote, dir);
  if (result.pending.length) throw invalid(`Card '${result.pending[0]}' is unresolved; choose a spec with \`spec:\` in the file.`, "spec", result.pending);
  for (const row of result.cards) {
    if (row.unmapped_options.length) throw invalid(`Card '${row.id}' sets options the schema does not map: ${row.unmapped_options.join(", ")}.`, row.unmapped_options[0], undefined, SCHEMA_HINT);
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

  const anomalies = result.cards.filter(row => row.price_anomaly).map(row => `Card "${row.id}": ${row.price_anomaly}`);

  // Multi-shard publishing branch
  if (result.shards && result.shards.length > 1) {
    const publishedShards: Dict[] = [];
    const allWarnings: string[] = [...anomalies];
    const resolvedSpecs = new Map(result.cards.map(c => [String(c.id), c.spec]));

    for (let i = 0; i < result.shards.length; i++) {
      const shard = result.shards[i]!;
      const shardTitle = name ? sanitizeTitle(`${title} - Part ${shard.index + 1}`) : shard.title;
      const shardCardIds = new Set(shard.resources.flatMap(r => r.physicalCards.map(p => p.title || p.cardId)));
      const shardCards = quote.cards.filter(c => shardCardIds.has(String(c.id)));

      progress(`Publishing Shard ${i + 1}/${result.shards.length}: ${shardTitle} (${shardCards.length} cards)`);

      const same = existing.filter(list => list.name === shardTitle);
      const duplicate = same.length ? `A list named "${shardTitle}" already exists (id ${String(same[0]!.key)}); this creates another.` : null;
      if (duplicate) allWarnings.push(duplicate);

      const shardRequirements = shardCards.map(card => ({
        ...card,
        ...(primaryGroupFor(card) ? { group: primaryGroupFor(card) } : {}),
        spec: resolvedSpecs.get(String(card.id)) || card.spec,
      }));

      const shardDraftView = await draftQuoteTool(ctx, {
        customer: quote.customer,
        requirements: shardRequirements,
      });

      let published: Dict;
      try {
        published = await publishQuoteTool(ctx, {
          draft_id: shardDraftView.draft_id,
          name: shardTitle,
          settlement: quote.settlement as "total" | "monthly",
          currency: "USD",
        });
      } catch (err) {
        if (err instanceof CalculatorError && publishedShards.length > 0) {
          throw new CalculatorError(err.code, err.message, err.hint, {
            ...(typeof err.details === "object" && err.details ? err.details : {}),
            published_shards: publishedShards.map(s => ({
              index: s.index,
              title: s.title,
              id: s.id,
              url: s.url,
            })),
          });
        }
        throw err;
      }

      const skipped = (((published as Dict).checks ?? []) as Dict[])
        .filter(check => check.edit_skipped)
        .map(check => `Card "${check.title}": Edit check skipped for a known portal defect. ${check.edit_skipped}`);
      if (skipped.length) allWarnings.push(...skipped);
      if (Array.isArray(published.warnings)) allWarnings.push(...published.warnings);

      publishedShards.push({
        index: shard.index,
        title: shardTitle,
        id: published.id,
        url: published.url,
        cardCount: shard.cardCount,
        checks: published.checks,
      });
    }

    // Persist verified share links to quote.lock.yaml
    if (quote.version === "1" && quote.path) {
      try {
        const lockYamlPath = quote.path.replace(/\.[^./\\]+$/, "") + ".lock.yaml";
        const lockYamlText = await readFile(lockYamlPath, "utf8");
        const lockObj = parseLockfile(lockYamlText);
        for (const pub of publishedShards) {
          const match = lockObj.shards.find(s => s.index === pub.index);
          if (match) {
            match.share_id = String(pub.id);
            match.share_link = String(pub.url);
          }
        }
        await writeFile(lockYamlPath, stringifyLockfile(lockObj), "utf8");
      } catch {
        // Non-fatal if lockfile update fails
      }
    }

    const uniqueWarnings = [...new Set(allWarnings)];
    return {
      name: title,
      id: publishedShards[0]!.id,
      url: publishedShards[0]!.url,
      shards: publishedShards,
      urls: publishedShards.map(s => s.url),
      checks: publishedShards.flatMap(s => s.checks),
      ...(uniqueWarnings.length ? { warnings: uniqueWarnings } : {}),
    };
  }

  // Single shard publishing
  const same = existing.filter(list => list.name === title);
  const duplicate = same.length ? `A list named "${title}" already exists (id ${String(same[0]!.key)}); this creates another.` : null;
  const published = await publishQuoteTool(ctx, { draft_id: result.draft_id, name: title, settlement: quote.settlement as "total" | "monthly", currency: "USD" });
  const skipped = (((published as Dict).checks ?? []) as Dict[]).filter(check => check.edit_skipped).map(check => `Card "${check.title}": Edit check skipped for a known portal defect. ${check.edit_skipped}`);
  const warnings = [...((published as Dict).warnings ?? []), ...(duplicate ? [duplicate] : []), ...anomalies, ...skipped];

  if (quote.version === "1" && quote.path) {
    try {
      const lockYamlPath = quote.path.replace(/\.[^./\\]+$/, "") + ".lock.yaml";
      const lockYamlText = await readFile(lockYamlPath, "utf8");
      const lockObj = parseLockfile(lockYamlText);
      if (lockObj.shards.length > 0) {
        lockObj.shards[0]!.share_id = String((published as Dict).id);
        lockObj.shards[0]!.share_link = String((published as Dict).url);
        await writeFile(lockYamlPath, stringifyLockfile(lockObj), "utf8");
      }
    } catch {
      // Non-fatal
    }
  }

  return warnings.length ? { ...published, name: title, warnings } : { ...published, name: title };
}
