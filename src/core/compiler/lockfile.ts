/** Deterministic Lockfile Generator and Drift Detector (`quote.lock.yaml`).
 * Pins resolved catalog SKUs, verified prices, physical card mappings, and share links
 * to guarantee reproducible, auditable quotation lifecycles. */
import { CalculatorError } from "../errors.ts";
import type { CanonicalQuoteIR, CanonicalResourceIR } from "./ir.ts";

export interface LockedCard {
  card_id: string;
  title: string;
  quantity: number;
  unit_amount: number;
  total_amount: number;
}

export interface LockedResource {
  service: string;
  region: string;
  billing: string;
  sku_code?: string | undefined;
  unit_price: number;
  total_price: number;
  physical_cards: LockedCard[];
}

export interface LockedShard {
  index: number;
  title: string;
  card_count: number;
  estimated_bytes: number;
  share_id?: string | undefined;
  share_link?: string | undefined;
}

export interface QuoteLockfile {
  version: "1";
  generated_at: string;
  frontend_version?: string | undefined;
  input_hash: string;
  currency: string;
  total_amount: number;
  shards: LockedShard[];
  resources: Record<string, LockedResource>;
}

export interface DriftItem {
  resourceId: string;
  skuCode?: string | undefined;
  lockedPrice: number;
  currentPrice: number;
  delta: number;
}

export interface LockfileDriftReport {
  hasDrift: boolean;
  driftItems: DriftItem[];
  netDifference: number;
}

/** Serializes a CanonicalQuoteIR into a deterministic `quote.lock.yaml` structure. */
export function generateLockfile(
  ir: CanonicalQuoteIR,
  frontendVersion?: string,
  shards: LockedShard[] = []
): QuoteLockfile {
  const resources: Record<string, LockedResource> = {};

  for (const res of ir.resources) {
    resources[res.id] = {
      service: res.service,
      region: res.region,
      billing: res.billing,
      sku_code: res.skuCode,
      unit_price: res.unitPrice ?? 0,
      total_price: res.totalPrice ?? 0,
      physical_cards: res.physicalCards.map((c) => ({
        card_id: c.cardId,
        title: c.title,
        quantity: c.quantity,
        unit_amount: c.unitAmount,
        total_amount: c.totalAmount,
      })),
    };
  }

  return {
    version: "1",
    generated_at: new Date().toISOString(),
    frontend_version: frontendVersion,
    input_hash: ir.inputHash,
    currency: ir.metadata.currency,
    total_amount: ir.totalAmount,
    shards,
    resources,
  };
}

/** Converts lockfile object to YAML text. */
export function stringifyLockfile(lock: QuoteLockfile): string {
  return Bun.YAML.stringify(lock);
}

/** Parses lockfile YAML text into QuoteLockfile object. */
export function parseLockfile(yamlText: string): QuoteLockfile {
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(yamlText);
  } catch (err) {
    throw new CalculatorError("VALIDATION", `Cannot parse lockfile YAML: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CalculatorError("VALIDATION", "Lockfile must be a YAML object.");
  }

  const p = parsed as Record<string, any>;
  if (p.version !== "1") {
    throw new CalculatorError("VALIDATION", `Unsupported lockfile version '${p.version}'. Expected '1'.`);
  }

  return p as QuoteLockfile;
}

/** Detects price discrepancies between a locked quotation and active catalog prices. */
export function detectLockfileDrift(
  locked: QuoteLockfile,
  currentSkuPrices: Map<string, number>
): LockfileDriftReport {
  const driftItems: DriftItem[] = [];
  let netDifference = 0;

  for (const [id, res] of Object.entries(locked.resources)) {
    if (!res.sku_code) continue;

    const currentPrice = currentSkuPrices.get(res.sku_code);
    if (currentPrice !== undefined && Math.abs(currentPrice - res.unit_price) > 0.005) {
      const delta = currentPrice - res.unit_price;
      driftItems.push({
        resourceId: id,
        skuCode: res.sku_code,
        lockedPrice: res.unit_price,
        currentPrice,
        delta,
      });
      netDifference += delta;
    }
  }

  return {
    hasDrift: driftItems.length > 0,
    driftItems,
    netDifference,
  };
}
