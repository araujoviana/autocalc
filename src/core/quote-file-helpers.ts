/** Auxiliary helpers for declarative quote loading, locking, shard planning, and price projection. */
import { readFile, writeFile } from "node:fs/promises";
import { invalid } from "./quote/model.ts";
import { PRIMARY_GROUP } from "./services/publication.ts";
import {
  compileQuote,
  buildCanonicalQuoteIR,
  generateLockfile,
  stringifyLockfile,
  parseLockfile,
  partitionResources,
  type QuoteDocument,
  type ShardPartition,
  type LockedShard,
  type CanonicalResourceIR,
  MAX_LIST_CARDS,
} from "./compiler/index.ts";
import type { ActionContext } from "./types.ts";
import { ECS_DEFAULT_IMAGE } from "./schemas.ts";
import { imageLabel, matchImages } from "./services/ecs.ts";

export type Dict = Record<string, any>;
export const SCHEMA_HINT = "Read the autocalc://schema/<service> resource, or run `autocalc schema coverage <service>`.";
export const isObject = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);
export const formatBound = (v: number | null | undefined) => v == null ? "" : String(v);
export const sortKeys = (v: any): any =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : isObject(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]))
      : v;
export const sameNeeds = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a ?? {})) === JSON.stringify(sortKeys(b ?? {}));

export interface Quote {
  customer: string;
  cards: Dict[];
  name?: string | undefined;
  settlement: string;
  path?: string | undefined;
  version?: string | undefined;
  rawDocument?: QuoteDocument | undefined;
  compiledResources?: any[] | undefined;
}

/** Path to the legacy per-card JSON price/spec lockfile sidecar for `quote`. */
export const lockPath = (quote: Quote) => quote.path?.replace(/\.[^./\\]+$/, "") + ".lock.json";

/** Read and parse `quote.lock.json`, throwing a validation error if malformed instead of silently overwriting pins. */
export async function readLock(quote: Quote): Promise<Dict> {
  if (!quote.path) return {};
  let text: string;
  try { text = await readFile(lockPath(quote), "utf8"); } catch { return {}; }
  try { const lock = JSON.parse(text); if (isObject(lock)) return lock; } catch { /* reported below */ }
  throw invalid(`The lock file ${lockPath(quote)} is not valid JSON; fix or delete it.`, "lock"); // never silently replace a pin
}

/** Catalog images a card's image request cannot tell apart; empty when it names exactly one. */
export async function ambiguousImages(ctx: ActionContext, region: string, spec: string, image: unknown): Promise<string[]> {
  const info = await ctx.catalog.productInfo("ecs", region);
  const matched = matchImages(info.product["ec2_vm.image.special"] ?? [], spec.split(".")[0]!, typeof image === "string" && image ? image : ECS_DEFAULT_IMAGE);
  return matched.length > 1 ? matched.map(imageLabel) : [];
}

/** Resolve the catalog primary group name for a quote card. */
export function primaryGroupFor(card: Dict): string | undefined {
  if (card.group) return card.group;
  const svc = card.service.toLowerCase();
  if (svc === "cce" && (card.spec === "cce.autopilot.cluster" || String(card.options?.cluster_type ?? "").toLowerCase() === "autopilot")) return "cce_cce.autopilot";
  if (svc === "elb" && (card.spec?.startsWith("elbv3") || card.options?.type === "dedicated")) return "elb_elbv3";
  return PRIMARY_GROUP[svc];
}

/** The unit a card's list price is quoted in: ondemand per hour, monthly per month, yearly per year; FunctionGraph pay-per-use is per request. */
export function priceUnit(service: string, billing: string): "hour" | "month" | "year" | "request" {
  if (service.toLowerCase() === "function" && billing === "ondemand") return "request";
  return billing === "ondemand" ? "hour" : billing === "yearly" ? "year" : "month";
}

/** A list price over the quote horizon (730 h per month): null when the unit cannot be projected (per request, usage-priced). */
export function horizonAmount(price: number, unit: ReturnType<typeof priceUnit>, months: number): number | null {
  if (unit === "hour") return price * 730 * months;
  if (unit === "month") return price * months;
  if (unit === "year") return price * months / 12;
  return null;
}

/** Hourly list price of sustained CCE Autopilot container vCPU and memory (catalog sells them per second). */
export async function autopilotContainerHourly(ctx: ActionContext, region: string, vcpus: number, memoryGb: number): Promise<number> {
  if (!(vcpus > 0) && !(memoryGb > 0)) return 0;
  const skus = await ctx.catalog.skus("cce", region);
  const hourly = (spec: string) => {
    const od = skus.find(sku => sku.group === "cci_cci.autopilot" && sku.spec === spec)?.prices.ondemand;
    if (!od) return 0;
    const [stepRaw, unitRaw = ""] = od.per.split(/\s+/), step = Number(stepRaw) || 1, unit = unitRaw.toLowerCase();
    const perHour = unit.startsWith("second") ? 3600 : unit.startsWith("minute") ? 60 : 1;
    return od.amount * perHour / step;
  };
  return vcpus * hourly("autopilot.container.cpu") + memoryGb * hourly("autopilot.container.mem");
}

/** Partition planned cards into calculator lists and persist `<quote>.lock.yaml` for `version: "1"` quotes. */
export async function buildShardsAndWriteLockfile(quote: Quote, rows: Dict[]): Promise<ShardPartition[] | undefined> {
  if (quote.version === "1") {
    try {
      let compiled: { document: any; resources: any[] } | null = null;
      if (quote.rawDocument && quote.compiledResources) {
        compiled = { document: quote.rawDocument, resources: quote.compiledResources };
      } else if (quote.path) {
        try {
          const text = await readFile(quote.path, "utf8");
          compiled = compileQuote(text);
        } catch {
          // Non-fatal fallback
        }
      }
      if (!compiled) return undefined;

      const ir = buildCanonicalQuoteIR(compiled.document, compiled.resources);
      const rowById = new Map(rows.map((r, idx) => [String(r.id), { row: r, card: quote.cards[idx]! }]));
      for (const irRes of ir.resources) {
        let resTotal = 0;
        let counted = false;
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
            // unit_amount stays the list price as sold; total_amount is projected over the quote horizon
            const unit = priceUnit(irRes.service, String(row.billing ?? irRes.billing));
            irRes.priceUnit = unit;
            const projected = horizonAmount(p, unit, ir.horizon.effectiveMonths);
            if (projected === null) { physical.totalAmount = 0; continue; }
            physical.totalAmount = projected * (card.quantity ?? physical.quantity ?? 1);
            resTotal += physical.totalAmount;
            counted = true;
          }
        }
        irRes.totalPrice = resTotal;
        if (!counted) irRes.excludedFromTotal = true;
      }
      // the SKU list prices of the planned resources over the horizon; disks and other add-ons are priced when the list is published
      ir.totalAmount = ir.resources.reduce((sum, resource) => sum + (resource.totalPrice ?? 0), 0);

      const titlePrefix = quote.name || compiled.document.metadata?.title_prefix || "Quote";
      const shards = partitionResources(ir.resources, titlePrefix);

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
      return shards;
    } catch {
      // Non-fatal if lockfile write fails
      return undefined;
    }
  }

  if (quote.cards.length > MAX_LIST_CARDS) {
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
    return partitionResources(pseudoResources, quote.name || "Quote");
  }

  return undefined;
}

/** Extract portal-defect skipped-edit warnings from a published list payload. */
export function extractSkippedEditWarnings(published: Dict): string[] {
  return (((published as Dict).checks ?? []) as Dict[])
    .filter(check => check.edit_skipped)
    .map(check => `Card "${check.title}": Edit check skipped for a known portal defect. ${check.edit_skipped}`);
}

/** Persist verified share ids/links into `<quote>.lock.yaml` after successful publish. */
export async function persistShareLinksToLockfile(
  quote: Quote,
  entries: ReadonlyArray<{ index: number; id: unknown; url: unknown }>,
): Promise<void> {
  if (quote.version !== "1" || !quote.path || entries.length === 0) return;
  try {
    const lockYamlPath = quote.path.replace(/\.[^./\\]+$/, "") + ".lock.yaml";
    const lockYamlText = await readFile(lockYamlPath, "utf8");
    const lockObj = parseLockfile(lockYamlText);
    for (const entry of entries) {
      const target = lockObj.shards.find(s => s.index === entry.index);
      if (target) {
        target.share_id = String(entry.id);
        target.share_link = String(entry.url);
      }
    }
    await writeFile(lockYamlPath, stringifyLockfile(lockObj), "utf8");
  } catch {
    // Non-fatal if lockfile update fails
  }
}
