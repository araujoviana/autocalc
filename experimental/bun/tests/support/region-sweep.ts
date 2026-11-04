/** Region sweep: which verified service/mode combinations still work in other regions.
 *
 * No login, nothing is saved. Tier 1 asks the catalog (is the service and mode sold in the region);
 * tier 2 has the calculator page build the card and compares its stored amount with the rating engine's
 * price for the same products. Mirrors `tests/support/region_sweep.py` and `tests/support/spa_matrix.py`.
 *
 * Run:  SWEEP_REGIONS=sa-brazil-1,la-south-2 bun tests/support/region-sweep.ts
 *       SWEEP_ONLY=esw,eip ...      limits the services;  SWEEP_TIER1=1 skips the page
 *       SWEEP_WORKERS=8 ...         browser contexts in parallel (default 6; page-load timeouts are retried)
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { checkAvailability } from "../../src/core/availability.ts";
import { BrowserManager } from "../../src/core/browser.ts";
import { CatalogCache } from "../../src/core/cache.ts";
import { inFormOnlyMode } from "../../src/core/cards.ts";
import { Catalog } from "../../src/core/catalog.ts";
import { RATE } from "../../src/core/endpoints.ts";
import { CalculatorError } from "../../src/core/errors.ts";
import { rerate } from "../../src/core/gate.ts";
import { encodeCard } from "../../src/core/page/encode.ts";
import { inquiry } from "../../src/core/pricing.ts";
import { cents, compareDecimal, formatCents } from "../../src/core/quote/decimal.ts";
import { PRIMARY_REGIONS } from "../../src/core/regions.ts";
import { buildRecipe, RECIPES } from "../../src/core/services/forms.ts";
import { buildCard } from "../../src/core/services/index.ts";
import { PublicTransport } from "../../src/core/transport.ts";

type Dict = Record<string, any>;
export type MatrixEntry = [service: string, billing: "ondemand" | "monthly" | "yearly", options: Dict];

const RDS = {
  flavor: "rds.pg.n1.large.4",
  storage_spec: "rds.pg.volume.cloudssd",
  storage_gb: 160,
  db_version: "dataInfo_107_",
};
const ECS = {
  flavor: "c7n.large.2",
  image: "Ubuntu",
  data_disks: [["GPSSD", 50]],
  bandwidth_mbit: 5,
};

const BASE_MATRIX: MatrixEntry[] = [
  ["ecs", "monthly", ECS],
  ["evs", "ondemand", { type: "GPSSD", size_gb: 100 }],
  ["evs", "monthly", { type: "GPSSD", size_gb: 100 }],
  ["evs", "yearly", { type: "GPSSD", size_gb: 100 }],
  ["cce", "ondemand", {}],
  ["cce", "yearly", { ha: false }],
  ["elb", "ondemand", {}],
  ["elb", "yearly", {}],
  ["obs", "monthly", { package: "200tb" }],
  ["obs", "yearly", { package: "50tb" }],
  ["rds", "ondemand", RDS],
  ["rds", "yearly", RDS],
  ["sfsturbo", "ondemand", { size_gb: 3686 }],
  ["sfsturbo", "yearly", { size_gb: 3686 }],
];

const WAVE1: MatrixEntry[] = [
  ["apig", "ondemand", {}],
  ["apm", "ondemand", {}],
  ...(["ondemand", "monthly", "yearly"] as const).map((b): MatrixEntry => ["cbr", b, {}]),
  ["cci", "ondemand", {}],
  ["dew", "ondemand", {}],
  ...(["monthly", "yearly"] as const).map((b): MatrixEntry => ["dline", b, {}]),
  ["function", "ondemand", { requests: 20_000_000, gb_seconds: 10_000_000, memory_mb: 512 }],
  ...(["ondemand", "monthly", "yearly"] as const).map((b): MatrixEntry => ["kafka", b, {}]),
  ["lts", "ondemand", { flow_gb: 10, index_gb: 10 }],
  ["nat", "ondemand", {}],
  ...(["ondemand", "monthly", "yearly"] as const).map((b): MatrixEntry => ["nosql", b, {}]),
  ...(["ondemand", "monthly", "yearly"] as const).map((b): MatrixEntry => ["rabbitmq", b, {}]),
  ["waf", "ondemand", {}],
];

const NONZERO: Record<string, Dict> = {
  "er:ondemand": { downflow_gb: 100, attachment_hours: 730, attachments: 2 },
  "cbh:monthly": { edition: "dataInfo_1_" },
  "cbh:yearly": { edition: "dataInfo_1_" },
  "ssa:monthly": { edition: "dataInfo_1_" },
  "ssa:yearly": { edition: "dataInfo_1_" },
  "sfs:ondemand": { capacity_gb: 100 },
};

const WAVE2: MatrixEntry[] = Object.entries(RECIPES).flatMap(([svc, r]) =>
  r.modes.map((b): MatrixEntry => [svc, b, NONZERO[`${svc}:${b}`] ?? {}]),
);

export const MATRIX: MatrixEntry[] = [...BASE_MATRIX, ...WAVE1, ...WAVE2];

export const RETRY_STEPS = new Set(["open", "price", "add_to_list"]);
export const RETRY_FIELDS = new Set(["global_PERIODTIME_UNSET_PeriodTime"]);

export interface EncodeDeps {
  encodeCard?: (service: string, rewriteValue: Dict, options: { timeout: number }) => Promise<Dict>;
  sleep?: (seconds: number) => Promise<void>;
  tries?: number;
}

export async function encode(service: string, rewriteValue: Dict, deps: EncodeDeps = {}): Promise<Dict> {
  const tries = deps.tries ?? 3;
  const sleep = deps.sleep ?? (s => new Promise(resolve => setTimeout(resolve, s * 1000)));
  const runEncode = deps.encodeCard ?? (() => { throw new Error("encodeCard dependency required"); });
  for (let n = 0; n < tries; n++) {
    try {
      return await runEncode(service, rewriteValue, { timeout: 10 });
    } catch (err) {
      const details = err instanceof CalculatorError ? (err.details ?? {}) : {};
      const retryable =
        err instanceof CalculatorError &&
        err.code === "PAGE_ENCODE_FAILED" &&
        (RETRY_STEPS.has(String(details.step ?? "")) || RETRY_FIELDS.has(String(details.field ?? "")));
      if (n === tries - 1 || !retryable) throw err;
      await sleep(2 * 2 ** n);
    }
  }
  throw new Error("unreachable");
}

export function tier1(menu: unknown, service: string, region: string, billing: "ondemand" | "monthly" | "yearly"): string | null {
  try {
    checkAvailability(menu, service, region, billing);
  } catch (err) {
    if (err instanceof CalculatorError) {
      return `not sold: ${err.message.split(/\r?\n/)[0]}`;
    }
    throw err;
  }
  return null;
}

export interface Tier2Deps {
  productInfo: (service: string, region: string) => Promise<{ product: Record<string, Record<string, unknown>[]> }>;
  rate: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  encodeCard: (service: string, rewriteValue: Dict, options: { timeout: number }) => Promise<Dict>;
  sleep?: (seconds: number) => Promise<void>;
  formOnly?: boolean;
}

export async function tier2(
  deps: Tier2Deps,
  service: string,
  region: string,
  billing: "ondemand" | "monthly" | "yearly",
  options: Dict,
): Promise<string> {
  try {
    const input = { service, region, billing, ...options };
    const card = service in RECIPES
      ? buildRecipe(service, input as never)
      : deps.formOnly
        ? await inFormOnlyMode(() => buildCard(input as never, { productInfo: deps.productInfo, rate: deps.rate }))
        : await buildCard(input as never, { productInfo: deps.productInfo, rate: deps.rate });
    const page = await encode(service, card.rewriteValue as Dict, { encodeCard: deps.encodeCard, ...(deps.sleep ? { sleep: deps.sleep } : {}) });
    const stored = cents(page.selectedProduct.amount);
    const rated = await rerate(page, deps.rate);
    if (compareDecimal(stored, rated) !== 0) {
      return `FAIL stored ${formatCents(stored)} != rated ${formatCents(rated)}`;
    }
    return `pass ${formatCents(stored)}`;
  } catch (err) {
    if (err instanceof CalculatorError) {
      return `FAIL ${err.code}: ${err.message.split(/\r?\n/)[0]!.slice(0, 110)}`;
    }
    const name = err instanceof Error ? err.constructor.name : "Error";
    const msg = err instanceof Error ? err.message : String(err);
    return `FAIL ${name}: ${msg.split(/\r?\n/)[0]!.slice(0, 110)}`;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]!);
      }
    }),
  );
  return results;
}

export async function main(): Promise<number> {
  const defaultRegions = PRIMARY_REGIONS.join(",");
  const regions: string[] = (process.env.SWEEP_REGIONS ?? defaultRegions).split(",").filter(Boolean);
  const only = new Set((process.env.SWEEP_ONLY ?? "").split(",").filter(Boolean));
  const workers = Math.max(1, Number.parseInt(process.env.SWEEP_WORKERS ?? "6", 10) || 6);
  const tier1Only = Boolean(process.env.SWEEP_TIER1);

  const transport = new PublicTransport(
    new CatalogCache(process.env.AUTOCALC_CACHE ?? join(homedir(), ".cache", "autocalc")),
  );
  const catalog = new Catalog(transport);
  const browser = new BrowserManager({ headed: process.env.AUTOCALC_PAGE_HEADED === "1" });
  const t0 = performance.now();
  try {
    const menu = await catalog.menu();
    const jobs = regions.flatMap(r =>
      MATRIX.filter(([s]) => !only.size || only.has(s)).map(([s, b, o]) => [s, r, b, o] as const),
    );
    const rows: Array<[string, string, string, string]> = [];
    const todo: Array<readonly [string, string, "ondemand" | "monthly" | "yearly", Dict]> = [];
    for (const [s, r, b, o] of jobs) {
      const why = tier1(menu, s, r, b);
      if (why) rows.push([s, r, b, why]);
      else todo.push([s, r, b, o]);
    }
    if (!tier1Only) {
      const deps: Tier2Deps = {
        productInfo: (svc, reg) => catalog.productInfo(svc, reg),
        rate: body => inquiry(val => transport.post(RATE, val), body),
        encodeCard: (svc, rv, opts) => encodeCard(browser, svc, rv, opts),
      };
      const results = await mapLimit(todo, workers, ([s, r, b, o]) => tier2(deps, s, r, b, o));
      todo.forEach(([s, r, b], idx) => rows.push([s, r, b, results[idx]!]));
    } else {
      for (const [s, r, b] of todo) rows.push([s, r, b, "sold (tier 1 only)"]);
    }
    rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
    process.stdout.write("| service | region | mode | result |\n|---|---|---|---|\n");
    for (const [s, r, b, res] of rows) {
      process.stdout.write(`| ${s} | ${r} | ${b} | ${res} |\n`);
    }
    const bad = rows.filter(([, , , res]) => res.startsWith("FAIL")).length;
    process.stderr.write(`\n${rows.length} combinations, ${bad} failed, ${Math.round((performance.now() - t0) / 1000)} s\n`);
    return bad ? 1 : 0;
  } finally {
    await browser.close();
    await transport.close();
  }
}

if (import.meta.main) process.exitCode = await main();
