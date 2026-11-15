/** Reproducible performance benchmark harness for autocalc (Fase 1 Diagnosis).
 *
 * Measures:
 * - Experiment A: 7-stage end-to-end pipeline (compilar, normalizar, pagina, salvar, rating, edit, publicar)
 *   across 1, 10, 50, 100, and 153 resources (213 cards / 2 shards) with discarded warmups + repetitions.
 * - Experiment B: Isolated bottlenecks (CPU compiler/normalizer, uncached YAML schemas, disk CatalogCache+Zod
 *   vs RAM memoization, DraftStore/RunRecord I/O, Chromium cold context vs warm page reuse, sequential vs
 *   parallel Edit check).
 * - Experiment C: Concurrency speedup sweep (workers = 1, 2, 3, 4, 6, 8) for Playwright browser encoding
 *   on local loopback and catalog lookups.
 *
 * Modes:
 * - Default (`offline`): 100% local CPU + disk fixtures + real headless Chromium against a local loopback SPA.
 *   Never touches external Huawei Cloud endpoints and never invents/estimates timings.
 * - Optional (`--live`): runs against the live Huawei Cloud calculator using an already logged-in profile.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { availableParallelism, cpus, freemem, homedir, release, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { AuthManager } from "../src/core/auth.ts";
import { checkAvailability } from "../src/core/availability.ts";
import { BrowserManager } from "../src/core/browser.ts";
import { CatalogCache } from "../src/core/cache.ts";
import { inFormOnlyMode, sharePayload } from "../src/core/cards.ts";
import { Catalog } from "../src/core/catalog.ts";
import { buildCanonicalQuoteIR, compileQuote, partitionResources } from "../src/core/compiler/index.ts";
import { normalizeResourceToCards } from "../src/core/compiler/normalizer.ts";
import { profilePaths, resolveConfig } from "../src/core/config.ts";
import { CalculatorError } from "../src/core/errors.ts";
import { endpoints, RATE, shareLink } from "../src/core/endpoints.ts";
import { liveVersion } from "../src/core/frontend.ts";
import { publishChecked, RATING_WORKERS, verify } from "../src/core/gate.ts";
import { ListSession, shareDetail } from "../src/core/lists.ts";
import { asPageLike, Driver, type DriverOptions, type PageLike } from "../src/core/page/driver.ts";
import { editCheck, checkCard, type EditResult } from "../src/core/page/edit.ts";
import { encodeCard } from "../src/core/page/encode.ts";
import { cardSteps, forPage, PAGE_SERVICE } from "../src/core/page/replay.ts";
import { js, OVERLAYS } from "../src/core/page/store.ts";
import { inquiry } from "../src/core/pricing.ts";
import { encodeWorkers } from "../src/core/publish.ts";
import { apply, parse, plan, validate } from "../src/core/quote-file.ts";
import { Draft, requirement } from "../src/core/quote/model.ts";
import { DraftStore } from "../src/core/quote/store.ts";
import { RunRecord } from "../src/core/quote/runs.ts";
import { loadService, clearServiceSchemaCache } from "../src/core/schema-model.ts";
import { buildRecipe, RECIPES } from "../src/core/services/forms.ts";
import { buildCard as buildServiceCard } from "../src/core/services/index.ts";
import { PublicTransport } from "../src/core/transport.ts";
import type { ActionContext } from "../src/core/types.ts";
import { HuaweiProvider } from "../src/providers/huawei.ts";

type Dict = Record<string, any>;

export type BenchStageId =
  | "compilar"
  | "normalizar"
  | "pagina"
  | "salvar"
  | "rating"
  | "edit"
  | "publicar";

export const STAGE_LABELS: Record<BenchStageId, string> = {
  compilar: "Compilar / Validar",
  normalizar: "Normalizar / Plan / Shards",
  pagina: "Página / Forms / Encode",
  salvar: "Salvar Lista / Detail",
  rating: "Rating Engine (rerate)",
  edit: "Edit Check (Browser)",
  publicar: "Publicar / Lock / Persist",
};

export interface BenchStageMetrics {
  stage: BenchStageId;
  label: string;
  samples_ms: number[];
  median_ms: number;
  p95_ms: number;
  share_pct: number;
}

export interface BenchScenarioResult {
  id: string;
  label: string;
  resource_count: number;
  card_count: number;
  shard_count: number;
  warmup: number;
  repetitions: number;
  total_median_ms: number;
  total_p95_ms: number;
  stages: BenchStageMetrics[];
  sub_breakdown_ms?: Record<string, { median_ms: number; p95_ms: number }>;
}

export interface BenchBottleneckItem {
  id: string;
  name: string;
  category: "cpu" | "io_cache" | "browser" | "serialization" | "architecture";
  scenario: string;
  repetitions: number;
  median_ms: number;
  p95_ms: number;
  comparison_ms?: number;
  delta_pct?: number;
  share_of_total_pct?: number;
  summary: string;
}

export interface BenchConcurrencyPoint {
  kind: "browser_encode" | "catalog_lookup";
  workers: number;
  item_count: number;
  repetitions: number;
  median_ms: number;
  p95_ms: number;
  speedup: number;
  efficiency_pct: number;
}

export interface BenchRunResult {
  schema_version: "1.0.0";
  timestamp: string;
  mode: "offline" | "live";
  metadata: {
    commit: string;
    branch: string;
    dirty: boolean;
    os_platform: string;
    os_release: string;
    arch: string;
    cpu_model: string;
    cpu_count: number;
    total_mem_mb: number;
    free_mem_mb: number;
    bun_version: string;
    warmup: number;
    repetitions: number;
    encode_workers_default: number;
    rating_workers_default: number;
  };
  scenarios: BenchScenarioResult[];
  bottlenecks: BenchBottleneckItem[];
  concurrency: BenchConcurrencyPoint[];
  notes?: string[];
}

const ROOT = resolve(import.meta.dir, "..");
const SCENARIOS_DIR = join(ROOT, "tests", "fixtures", "scenarios");
const COMPAT_DIR = join(ROOT, "tests", "fixtures", "compat");
const BENCH_DIR = join(ROOT, "bench");
const RESULTS_DIR = join(BENCH_DIR, "results");
const BASELINE_PATH = join(BENCH_DIR, "baseline.json");
const BASELINE_LIVE_PATH = join(BENCH_DIR, "baseline-live.json");

const round2 = (n: number) => Math.round(n * 100) / 100;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return round2(sorted[mid]!);
  return round2((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function p95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return round2(sorted[idx]!);
}

function gitInfo(): { commit: string; branch: string; dirty: boolean } {
  const run = (cmd: string, fallback: string) => {
    try {
      return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim() || fallback;
    } catch {
      return fallback;
    }
  };
  const commit = run("git rev-parse --short HEAD", "unknown");
  const branch = run("git rev-parse --abbrev-ref HEAD", "unknown");
  const status = run("git status --porcelain", "");
  return { commit, branch, dirty: status.length > 0 };
}

function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return JSON.stringify(String(v));
}

function toYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return value
      .map(item => {
        if (item !== null && typeof item === "object") {
          const rendered = toYaml(item, indent + 1);
          const lines = rendered.split("\n");
          const first = lines[0]!.trimStart();
          const rest = lines.slice(1).join("\n");
          return rest ? `${pad}- ${first}\n${rest}` : `${pad}- ${first}`;
        }
        return `${pad}- ${yamlScalar(item)}`;
      })
      .join("\n");
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Dict).filter(([, v]) => v !== undefined);
    if (!entries.length) return "{}";
    return entries
      .map(([k, v]) => {
        const keyStr = /^[a-zA-Z0-9_-]+$/.test(k) ? k : JSON.stringify(k);
        if (Array.isArray(v)) {
          if (!v.length) return `${pad}${keyStr}: []`;
          return `${pad}${keyStr}:\n${toYaml(v, indent + 1)}`;
        }
        if (v !== null && typeof v === "object") {
          const objEntries = Object.entries(v as Dict).filter(([, sv]) => sv !== undefined);
          if (!objEntries.length) return `${pad}${keyStr}: {}`;
          return `${pad}${keyStr}:\n${toYaml(v, indent + 1)}`;
        }
        return `${pad}${keyStr}: ${yamlScalar(v)}`;
      })
      .join("\n");
  }
  return yamlScalar(value);
}

interface ScenarioSpec {
  id: string;
  label: string;
  yamlText: string;
  expectedResources: number;
  expectedCards: number;
  expectedShards: number;
}

async function buildBenchScenarios(): Promise<ScenarioSpec[]> {
  const files = (await readdir(SCENARIOS_DIR)).filter(f => f.endsWith(".yaml") && !f.endsWith(".lock.yaml")).sort();
  const parsedDocs: Array<{ prefix: string; doc: Dict }> = [];
  for (let i = 0; i < files.length; i++) {
    const rawText = await readFile(join(SCENARIOS_DIR, files[i]!), "utf8");
    const doc = Bun.YAML.parse(rawText) as Dict;
    parsedDocs.push({ prefix: `s${String(i + 1).padStart(2, "0")}`, doc });
  }

  function composeQuote(targetResources: number, includeOverflow: boolean): string {
    const templates: Dict = {};
    const environments: Dict = {};
    const resources: Dict[] = [];

    for (const { prefix, doc } of parsedDocs) {
      if (resources.length >= targetResources) break;
      const docDefaults: Dict = (doc.defaults as Dict) ?? {};
      const srcTpls: Dict = (doc.templates as Dict) ?? {};
      for (const [k, v] of Object.entries(srcTpls)) {
        templates[`${prefix}_${k}`] = structuredClone(v);
      }
      const srcEnvs: Dict = (doc.environments as Dict) ?? {};
      for (const [k, v] of Object.entries(srcEnvs)) {
        environments[`${prefix}_${k}`] = {
          region: docDefaults.region ?? "sa-brazil-1",
          availability: docDefaults.availability ?? "multi-az",
          ...structuredClone(v as Dict),
        };
      }
      const srcRes: Dict[] = Array.isArray(doc.resources) ? doc.resources : [];
      for (const r of srcRes) {
        if (resources.length >= targetResources) break;
        const copy: Dict = structuredClone(r);
        copy.id = `${prefix}_${String(r.id)}`;
        if (copy.use) copy.use = `${prefix}_${String(copy.use)}`;
        if (copy.environment) copy.environment = `${prefix}_${String(copy.environment)}`;
        if (!copy.billing && docDefaults.billing) copy.billing = docDefaults.billing;
        if (!copy.region && !copy.environment && docDefaults.region) copy.region = docDefaults.region;
        resources.push(copy);
      }
    }

    if (includeOverflow) {
      resources.push(
        {
          id: "overflow_dew_keys",
          service: "dew",
          region: "sa-brazil-1",
          billing: "ondemand",
          options: { custom_keys: 2800, hsm_edition: "standard", hsm_instances: 1 },
        },
        {
          id: "overflow_obs_traffic",
          service: "obs",
          region: "sa-brazil-1",
          billing: "ondemand",
          options: { storage_class: "standard", capacity: "60 TB", traffic: "3300 TB/mo" },
        },
        {
          id: "overflow_anchor_ecs",
          service: "ecs",
          region: "sa-brazil-1",
          billing: "monthly",
          needs: { vcpus: 4, memory: "16 GiB" },
          options: { os: "ubuntu-22.04", system_disk: { type: "high-io", size: "100 GiB" } },
        },
      );
    }

    const docObj = {
      version: "1",
      metadata: {
        id: `bench-${resources.length}${includeOverflow ? "-multishard" : ""}`,
        customer: "Autocalc Benchmark",
        title_prefix: `Bench ${resources.length}r`,
        currency: "USD",
      },
      horizon: { duration: "1y", billing_policy: "as-specified" },
      defaults: { provider: "huawei", region: "sa-brazil-1", availability: "multi-az", billing: "monthly" },
      templates,
      environments,
      resources,
    };
    return toYaml(docObj) + "\n";
  }

  const targets = [
    { id: "1-resource", label: "1 recurso (baseline mínimo)", count: 1, overflow: false },
    { id: "10-resources", label: "10 recursos (cotação pequena)", count: 10, overflow: false },
    { id: "50-resources", label: "50 recursos (cotação média)", count: 50, overflow: false },
    { id: "100-resources", label: "100 recursos (cotação grande, 1 shard)", count: 100, overflow: false },
    { id: "153-resources-multishard", label: "153 recursos (213 cartões, 2 shards)", count: 150, overflow: true },
  ];

  const specs: ScenarioSpec[] = [];
  for (const t of targets) {
    const yamlText = composeQuote(t.count, t.overflow);
    const compiled = compileQuote(yamlText);
    const ir = buildCanonicalQuoteIR(compiled.document, compiled.resources);
    const shards = partitionResources(ir.resources, compiled.document.metadata.title_prefix ?? "Bench");
    const parsed = parse(yamlText);
    specs.push({
      id: t.id,
      label: t.label,
      yamlText,
      expectedResources: compiled.resources.length,
      expectedCards: parsed.cards.length,
      expectedShards: shards.length,
    });
  }
  return specs;
}

class DiskBackedBenchReader {
  private readonly cache: CatalogCache;
  private readonly rawMenu: unknown;
  private readonly rawLabels: unknown;
  private readonly rawProducts: Record<string, unknown>;
  private readonly serverUrl: string;
  private ramMemo: Map<string, unknown> | null = null;

  constructor(cache: CatalogCache, compat: { menu: unknown; labels: unknown; products: Record<string, unknown> }, serverUrl: string) {
    this.cache = cache;
    this.rawMenu = compat.menu;
    this.rawLabels = compat.labels;
    this.rawProducts = compat.products;
    this.serverUrl = serverUrl;
  }

  enableRamMemo(enable: boolean): void {
    this.ramMemo = enable ? new Map() : null;
  }

  async seedCache(): Promise<void> {
    await this.cache.set(endpoints.menu("en-us"), this.rawMenu);
    await this.cache.set(endpoints.labels("en-us"), this.rawLabels);
    for (const [key, val] of Object.entries(this.rawProducts)) {
      const idx = key.lastIndexOf("_");
      if (idx <= 0) continue;
      const service = key.slice(0, idx);
      const region = key.slice(idx + 1);
      await this.cache.set(endpoints.product(service, region), val);
    }
  }

  async get(url: string, options?: { mirror?: string; refresh?: boolean }): Promise<unknown> {
    if (this.ramMemo?.has(url)) return this.ramMemo.get(url);
    if (!options?.refresh) {
      const diskHit = await this.cache.get(url);
      if (diskHit !== undefined) {
        if (this.ramMemo) this.ramMemo.set(url, diskHit);
        return diskHit;
      }
    }
    if (url.includes("/menuInfo") || options?.mirror?.includes("menuInfo")) return this.rawMenu;
    if (url.includes("/language")) return this.rawLabels;
    const match =
      /urlPath=([^&]+).*region=([^&]+)/.exec(url) ||
      /intl\/product\/([^_]+)_general.*_([^_]+)_calc_productInfo/.exec(options?.mirror || url);
    if (match) {
      const key = `${match[1]}_${match[2]}`;
      if (Object.hasOwn(this.rawProducts, key)) {
        const val = this.rawProducts[key];
        await this.cache.set(url, val);
        if (this.ramMemo) this.ramMemo.set(url, val);
        return val;
      }
    }
    throw new CalculatorError("UNEXPECTED_RESPONSE", `Bench reader missing fixture for URL: ${url}`);
  }

  async getUncached(url: string): Promise<unknown> {
    if (url.includes("/share/detail")) {
      const u = new URL(url);
      const key = u.searchParams.get("key") ?? "";
      const res = await fetch(`${this.serverUrl}/api/share/detail?key=${encodeURIComponent(key)}`);
      return res.json();
    }
    return this.get(url, { refresh: true });
  }
}

interface PendingEncodeSpec {
  card: Dict;
}

class LoopbackCalculatorServer {
  private server: ReturnType<typeof Bun.serve>;
  readonly baseUrl: string;
  private pendingEncodes = new Map<string, PendingEncodeSpec>();
  private lists = new Map<string, Dict>();
  private productAmounts = new Map<string, number>();
  private encodeSeq = 0;
  private listSeq = 0;

  constructor() {
    const self = this;
    this.server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/CBC-PortalCalculator/11.4.201/app.js") {
          return new Response(self.clientScript(), {
            headers: { "content-type": "application/javascript; charset=utf-8" },
          });
        }
        if (url.pathname === "/calc") {
          const encodeToken = url.searchParams.get("encode");
          const shareId = url.searchParams.get("shareListId");
          const pending = encodeToken ? self.pendingEncodes.get(encodeToken) : undefined;
          const shared = shareId ? self.lists.get(shareId) : undefined;
          return new Response(self.calcHtml(pending?.card ?? null, shared ?? null), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        if (url.pathname === "/api/share/list") {
          return Response.json({
            retCode: "200",
            lists: [...self.lists.entries()].map(([key, v]) => ({ key, name: v.name, total: v.totalPrice })),
          });
        }
        if (url.pathname === "/api/share/add" && req.method === "POST") {
          const body = (await req.json()) as Dict;
          const id = `beef${String(++self.listSeq).padStart(12, "0")}`;
          self.lists.set(id, body);
          return Response.json({ retCode: "200", data: id });
        }
        if (url.pathname === "/api/share/detail") {
          const key = url.searchParams.get("key") ?? "";
          const found = self.lists.get(key);
          if (!found) return Response.json({ retCode: "404" }, { status: 404 });
          return Response.json({ retCode: "200", data: found });
        }
        if (url.pathname === "/api/share/delete" && req.method === "POST") {
          const key = url.searchParams.get("key") ?? "";
          self.lists.delete(key);
          return Response.json({ retCode: "200", data: true });
        }
        if (url.pathname === "/api/rating" && req.method === "POST") {
          const body = (await req.json()) as Dict;
          const infos = Array.isArray(body.productInfos) ? (body.productInfos as Dict[]) : [];
          const result = infos.map(info => {
            const parts = String(info.id ?? "").split("-");
            const pid = parts.slice(2).join("-");
            const amount = self.productAmounts.get(pid) ?? 10.0;
            return { id: info.id, productId: pid || "bench-prod", amount, originalAmount: amount, discountAmount: 0 };
          });
          return Response.json({ productRatingResult: result });
        }
        return new Response("Not Found", { status: 404 });
      },
    });
    this.baseUrl = `http://127.0.0.1:${this.server.port}`;
  }

  registerCard(card: Dict): string {
    const token = `enc_${++this.encodeSeq}`;
    this.pendingEncodes.set(token, { card });
    for (const p of (card.selectedProduct?.productAllInfos ?? []) as Dict[]) {
      if (p.productId && typeof p.inquiryResult?.amount === "number") {
        this.productAmounts.set(String(p.productId), p.inquiryResult.amount);
      }
    }
    return token;
  }

  consumeEncode(token: string): void {
    this.pendingEncodes.delete(token);
  }

  resetLists(): void {
    this.lists.clear();
    this.pendingEncodes.clear();
    this.productAmounts.clear();
  }

  stop(): void {
    this.server.stop(true);
  }

  private calcHtml(pendingCard: Dict | null, sharedList: Dict | null): string {
    const payloadJson = JSON.stringify({ pendingCard, sharedList }).replaceAll("<", "\\u003c");
    return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>autocalc loopback</title></head>
<body>
  <div id="app">
    <button id="rshema_func_priceboard_addToList" type="button">Add to List</button>
    <button id="bench-view-details" type="button">View Details</button>
    <div id="bench-cards"></div>
  </div>
  <script id="bench-boot" type="application/json">${payloadJson}</script>
  <script src="${this.baseUrl}/CBC-PortalCalculator/11.4.201/app.js"></script>
</body>
</html>`;
  }

  private clientScript(): string {
    return String.raw`(() => {
  const boot = JSON.parse(document.getElementById('bench-boot').textContent || '{}');
  const cartState = { cartListDataBase: {}, editInfo: null };
  const templateRender = { type: { __name: 'template-render' }, props: { valueWatcher: { template_RENDER: { value: {} } } }, subTree: {} };
  const priceBoard = { type: { __name: 'func-priceboard' }, props: { selectedInfo: { rewriteValue: {} } }, subTree: {} };
  const rootInstance = { type: { __name: 'root' }, subTree: { children: [{ component: templateRender }, { component: priceBoard }] } };
  const cardsHost = document.getElementById('bench-cards');

  function rebuildCardVnodes() {
    const children = [{ component: templateRender }, { component: priceBoard }];
    cardsHost.innerHTML = '';
    for (const [key, card] of Object.entries(cartState.cartListDataBase)) {
      const wrap = document.createElement('div');
      wrap.className = 'collapse-card-item';
      const mkBtn = (label, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
      };
      wrap.appendChild(mkBtn('Edit', () => {
        cartState.editInfo = { originData: card, showData: { _cartId: key } };
        priceBoard.props.selectedInfo = { rewriteValue: JSON.parse(JSON.stringify(card.rewriteValue || {})) };
      }));
      wrap.appendChild(mkBtn('Save', () => {
        if (cartState.cartListDataBase[key]) {
          cartState.cartListDataBase[key].selectedProduct.timeTag =
            Math.max(Date.now(), (cartState.cartListDataBase[key].selectedProduct.timeTag || 0) + 1) + (++seq);
        }
        cartState.editInfo = null;
      }));
      wrap.appendChild(mkBtn('Cancel', () => {
        cartState.editInfo = null;
      }));
      cardsHost.appendChild(wrap);
      children.push({
        component: {
          type: { __name: 'collapse-card-item' },
          props: { sourceData: card.selectedProduct },
          subTree: { el: wrap },
        },
      });
    }
    rootInstance.subTree.children = children;
  }

  let seq = 0;
  document.getElementById('rshema_func_priceboard_addToList').addEventListener('click', () => {
    if (!boot.pendingCard) return;
    const key = 'bench_cart_' + (++seq);
    const cloned = JSON.parse(JSON.stringify(boot.pendingCard));
    cartState.cartListDataBase[key] = cloned;
    rebuildCardVnodes();
  });

  document.getElementById('bench-view-details').addEventListener('click', () => {
    if (!boot.sharedList || !Array.isArray(boot.sharedList.cartListData)) return;
    cartState.cartListDataBase = {};
    for (const card of boot.sharedList.cartListData) {
      const key = card.selectedProduct && card.selectedProduct._cartId ? String(card.selectedProduct._cartId) : 'c_' + (++seq);
      cartState.cartListDataBase[key] = JSON.parse(JSON.stringify(card));
    }
    rebuildCardVnodes();
  });

  const appEl = document.getElementById('app');
  appEl.__vue_app__ = {
    _instance: rootInstance,
    config: {
      globalProperties: {
        $pinia: { _s: new Map([['cartInfo', { $state: cartState }]]) },
      },
    },
  };
})();`;
  }
}

let loopbackCardSeq = 0;

function makeLoopbackCard(input: Dict, rewriteValue: Dict, spec: string): Dict {
  const service = String(input.service).toLowerCase();
  const region = String(input.region ?? "sa-brazil-1");
  const billing = String(input.billing ?? "monthly") as "ondemand" | "monthly" | "yearly";
  const quantity = Number(input.quantity ?? 1);
  const periods = Number(input.periods ?? 1);
  const hours = Number(input.hours ?? 730);
  const charges = {
    ondemand: ["ONDEMAND", "ONDEMAND", 4],
    monthly: ["PERIOD", "MONTHLY", 2],
    yearly: ["PERIOD", "YEARLY", 3],
  } as const;
  const [chargeMode, chargeModeName, periodType] = charges[billing];
  const timeTag = Date.now();
  const suffix = `${++loopbackCardSeq}_${Math.random().toString(16).slice(2, 8)}`;
  const baseProd: Dict = {
    selectIndex: 0,
    productId: `bench-${service}-${suffix}`,
    cloudServiceType: `hws.service.type.${service}`,
    resourceType: `hws.resource.type.${service}`,
    resourceSpecCode: spec,
    productNum: quantity,
    inquiryTag: "normal",
    addToList_product: {},
    ...(billing === "ondemand" ? { usageFactor: "Duration", usageMeasureId: 4, usageValue: hours } : {}),
    inquiryResult: { id: "0", productId: `bench-${service}-${suffix}`, amount: 12.34, originalAmount: 12.34, discountAmount: 0 },
  };
  const products: Dict[] = [baseProd];
  let totalAmount = 12.34;
  if (service === "ecs") {
    const toggle = (rewriteValue.template_RENDER as Dict | undefined)?.calculator_eip_switch?.UNSET_Switch;
    if (toggle === "calc_14_") {
      products.push({
        selectIndex: 1,
        productId: `bench-ecs-bw-${suffix}`,
        cloudServiceType: "hws.service.type.vpc",
        resourceType: "hws.resource.type.bandwidth",
        resourceSpecCode: "19_bgp",
        productNum: 1,
        inquiryTag: "normal",
        addToList_product: {},
        ...(billing === "ondemand" ? { usageFactor: "Duration", usageMeasureId: 4, usageValue: hours } : {}),
        inquiryResult: { id: "1", productId: `bench-ecs-bw-${suffix}`, amount: 3.21, originalAmount: 3.21, discountAmount: 0 },
      });
      totalAmount = 15.55;
    }
  }
  const cartId = `${service.toUpperCase()}_${suffix}`;
  const selectedProduct: Dict = {
    region,
    locationType: "commonAZ",
    chargeMode,
    tag: "general.online.portal",
    serviceCode: service,
    timeTag,
    chargeModeName,
    periodType,
    periodNum: billing === "ondemand" ? 1 : periods,
    subscriptionNum: 1,
    purchaseNum: { measureValue: quantity, measureId: 41, measureNameBeforeTrans: "calc_29_", measurePluralNameBeforeTrans: "calc_30_" },
    amount: totalAmount,
    originalAmount: totalAmount,
    discountAmount: 0,
    _cartId: cartId,
    _customTitle: `custom.${service} 1`,
    productAllInfos: products,
  };
  return { buyUrl: "", rewriteValue: forPage(service, rewriteValue), selectedProduct };
}

class LoopbackDriver extends Driver {
  constructor(
    page: PageLike,
    service: string,
    private readonly targetUrl: string,
    options: DriverOptions = {},
  ) {
    super(page, service, { timeout: 20, quiet: 0, pollMs: 5, ...options });
  }

  override async open(_url?: string): Promise<void> {
    await super.open(this.targetUrl);
  }

  override async run(): Promise<void> {
    // Card rewriteValue and selectedProduct are mounted on load by the loopback page;
    // keep 1 DOM bridge evaluate so Playwright IPC matches a populated form read.
    await this.page.evaluate(`() => document.querySelector('#app') !== null`);
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

async function measureOfflineScenario(
  spec: ScenarioSpec,
  compat: { menu: unknown; labels: unknown; products: Record<string, unknown> },
  server: LoopbackCalculatorServer,
  browser: BrowserManager,
  warmup: number,
  repetitions: number,
): Promise<BenchScenarioResult> {
  const stageIds: BenchStageId[] = ["compilar", "normalizar", "pagina", "salvar", "rating", "edit", "publicar"];
  const samplesByStage = Object.fromEntries(stageIds.map(s => [s, [] as number[]])) as Record<BenchStageId, number[]>;
  const totalSamples: number[] = [];

  for (let runIdx = 0; runIdx < warmup + repetitions; runIdx++) {
    const isWarmup = runIdx < warmup;
    clearServiceSchemaCache();
    const runDir = await mkdtemp(join(tmpdir(), `autocalc-bench-${spec.id}-`));
    try {
      server.resetLists();
      const cacheDir = join(runDir, "cache");
      const draftDir = join(runDir, "drafts");
      const quotePath = join(runDir, "quote.yaml");
      await writeFile(quotePath, spec.yamlText, "utf8");

      const cache = new CatalogCache(cacheDir);
      const reader = new DiskBackedBenchReader(cache, compat, server.baseUrl);
      await reader.seedCache();
      const catalog = new Catalog(reader);
      const provider = new HuaweiProvider({
        skus: (s, r) => catalog.skus(s, r),
        checkMode: async (s, r, b) => checkAvailability(await catalog.menu(), s, r, b as "ondemand" | "monthly" | "yearly"),
      });
      const drafts = new DraftStore(draftDir);

      // Phase timer accounting for 100% of apply() wall-clock time without double counting
      const stageMs = Object.fromEntries(stageIds.map(s => [s, 0])) as Record<BenchStageId, number>;
      let currentStage: BenchStageId = "normalizar";
      let phaseStart = 0;
      const switchStage = (next: BenchStageId) => {
        const now = performance.now();
        stageMs[currentStage] += now - phaseStart;
        currentStage = next;
        phaseStart = now;
      };

      const cardSpecsByForm = new WeakMap<object, { input: Dict; spec: string }>();
      let latestReqSpecs: Array<{ service: string; region: string; billing: string; options: Dict; spec: string }> = [];
      let activeDraftSpecs: Array<{ service: string; spec: string }> = [];
      let formCallIdx = 0;
      const originalSave = drafts.save.bind(drafts);
      drafts.save = async draft => {
        const specByReq = new Map(draft.decisions.map(d => [d.requirement_id, d.spec]));
        latestReqSpecs = draft.requirements.map(r => ({
          service: r.service.toLowerCase(),
          region: r.region,
          billing: r.billing,
          options: r.options,
          spec: specByReq.get(r.id) ?? r.spec ?? "bench.spec",
        }));
        return originalSave(draft);
      };
      const originalLoad = drafts.load.bind(drafts);
      drafts.load = async id => {
        const draft = await originalLoad(id);
        const specByReq = new Map(draft.decisions.map(d => [d.requirement_id, d.spec]));
        activeDraftSpecs = draft.requirements.map(r => ({
          service: r.service.toLowerCase(),
          spec: specByReq.get(r.id) ?? r.spec ?? "bench.spec",
        }));
        formCallIdx = 0;
        return draft;
      };

      const rate = async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
        const res = await fetch(`${server.baseUrl}/api/rating`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return (await res.json()) as Record<string, unknown>;
      };

      const lists: Pick<ListSession, "lists" | "create" | "update" | "delete" | "copy"> = {
        lists: async () => {
          const res = await fetch(`${server.baseUrl}/api/share/list`);
          const data = (await res.json()) as Dict;
          return (data.lists as unknown[]) ?? [];
        },
        create: async (payload: Dict) => {
          const res = await fetch(`${server.baseUrl}/api/share/add`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = (await res.json()) as Dict;
          return String(data.data);
        },
        update: async () => {},
        delete: async (id: string) => {
          await fetch(`${server.baseUrl}/api/share/delete?key=${encodeURIComponent(id)}`, { method: "POST" });
        },
        copy: async () => "cafe000000000001",
      };

      const ctx: ActionContext = {
        reader,
        catalog,
        rating: rate,
        lists,
        auth: { status: async () => ({ authenticated: true, expires_at: null }), login: async () => ({ ok: true }) } as never,
        provider,
        drafts,
        publish: {
          form: async input => {
            const expectedIdx = formCallIdx++;
            if (currentStage !== "pagina") switchStage("pagina");
            const svc = String(input.service).toLowerCase();
            const expectedFromDraft =
              activeDraftSpecs[expectedIdx]?.service === svc ? activeDraftSpecs[expectedIdx]!.spec : undefined;
            const rw = svc in RECIPES
              ? buildRecipe(svc, input as never).rewriteValue
              : ((await inFormOnlyMode(() =>
                  buildServiceCard(input as never, {
                    productInfo: (s, r) => catalog.productInfo(s, r),
                    rate: async () => {
                      throw new CalculatorError("AUTOCALC", "A form-only build must not rate.");
                    },
                  }),
                )).rewriteValue as Dict);
            // Resolve SKU spec from active draft decision (or fallback heuristics) for loopback selectedProduct construction
            let resolvedSpec = expectedFromDraft ?? (
              typeof input.flavor === "string"
                ? input.flavor
                : typeof input.type === "string" && svc === "evs"
                  ? `${input.type}.storage`
                  : typeof input.size === "string" && svc === "nat"
                    ? `natgateway_${input.size}`
                    : undefined
            );
            if (!resolvedSpec) {
              const matched = latestReqSpecs.find(r =>
                r.service === svc &&
                r.region === String(input.region) &&
                r.billing === String(input.billing) &&
                Object.entries(r.options).every(([k, v]) => JSON.stringify(input[k]) === JSON.stringify(v)),
              );
              if (matched) resolvedSpec = matched.spec;
            }
            if (!resolvedSpec) {
              const skus = await catalog.skus(svc, String(input.region));
              resolvedSpec = skus[0]?.spec ?? "bench.spec";
            }
            cardSpecsByForm.set(rw, { input, spec: resolvedSpec });
            return rw;
          },
          encode: async (service, rewriteValue) => {
            const meta = cardSpecsByForm.get(rewriteValue);
            const fullCard = meta
              ? makeLoopbackCard(meta.input, rewriteValue, meta.spec)
              : makeLoopbackCard({ service, region: "sa-brazil-1", billing: "monthly", quantity: 1 }, rewriteValue, "bench.spec");
            const token = server.registerCard(fullCard);
            try {
              const encoded = await encodeCard(browser, service, rewriteValue, {
                makeDriver: (page, s, opts) => new LoopbackDriver(page, s, `${server.baseUrl}/calc?encode=${token}#/${s}`, opts),
              });
              return encoded;
            } finally {
              server.consumeEncode(token);
            }
          },
          publish: async (name, cards, options) => {
            switchStage("salvar");
            let ratingStarted = false;
            const out = await publishChecked(name, cards, {
              lists,
              settlement: options.settlement,
              currency: options.currency,
              check: async (listId, expectedCards) => {
                const instrumentedRate: typeof rate = async body => {
                  if (!ratingStarted) {
                    ratingStarted = true;
                    switchStage("rating");
                  }
                  return rate(body);
                };
                const res = await verify(
                  listId,
                  {
                    reader,
                    rate: instrumentedRate,
                    edit: async lid => {
                      switchStage("edit");
                      const editRes = await editCheck(reader, browser, lid, {
                        makeDriver: (page, s, opts) =>
                          new LoopbackDriver(page, s, `${server.baseUrl}/calc?shareListId=${encodeURIComponent(lid)}`, opts),
                      });
                      switchStage("publicar");
                      return editRes;
                    },
                  },
                  expectedCards,
                );
                if (currentStage !== "publicar") switchStage("publicar");
                return res;
              },
            });
            return out;
          },
          liveVersion: async () => "11.4.201",
        },
      };

      const tCompile0 = performance.now();
      const parsedQuote = parse(spec.yamlText, quotePath);
      const valIssues = await validate(parsedQuote);
      if (valIssues.length) throw new Error(`Validation failed for ${spec.id}: ${JSON.stringify(valIssues)}`);
      stageMs.compilar = performance.now() - tCompile0;

      currentStage = "normalizar";
      phaseStart = performance.now();
      const applied = await apply(ctx, parsedQuote);
      stageMs[currentStage] += performance.now() - phaseStart;

      // Sanity check fail-closed gate execution
      if (spec.expectedShards > 1) {
        if (!Array.isArray(applied.shards) || applied.shards.length !== spec.expectedShards) {
          throw new Error(`Expected ${spec.expectedShards} shards for ${spec.id}, got ${String(applied.shards?.length)}`);
        }
      } else if (!applied.url) {
        throw new Error(`Expected published URL for ${spec.id}`);
      }

      if (!isWarmup) {
        for (const id of stageIds) samplesByStage[id].push(stageMs[id]);
        const tot = stageIds.reduce((acc, s) => acc + stageMs[s], 0);
        totalSamples.push(tot);
      }
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  }

  const totalMedian = median(totalSamples);
  const stages: BenchStageMetrics[] = stageIds.map(id => {
    const samples = samplesByStage[id].map(round2);
    const med = median(samples);
    return {
      stage: id,
      label: STAGE_LABELS[id],
      samples_ms: samples,
      median_ms: med,
      p95_ms: p95(samples),
      share_pct: totalMedian > 0 ? round2((med / totalMedian) * 100) : 0,
    };
  });

  return {
    id: spec.id,
    label: spec.label,
    resource_count: spec.expectedResources,
    card_count: spec.expectedCards,
    shard_count: spec.expectedShards,
    warmup,
    repetitions,
    total_median_ms: totalMedian,
    total_p95_ms: p95(totalSamples),
    stages,
  };
}

async function measureBottlenecks(
  specs: ScenarioSpec[],
  compat: { menu: unknown; labels: unknown; products: Record<string, unknown> },
  server: LoopbackCalculatorServer,
  browser: BrowserManager,
): Promise<BenchBottleneckItem[]> {
  const s100 = specs.find(s => s.id === "100-resources")!;
  const s153 = specs.find(s => s.id === "153-resources-multishard")!;
  const reps = 5;
  const bottlenecks: BenchBottleneckItem[] = [];

  // 1. Pure CPU compiler/normalizer/partitioner on 153-resources
  const cpuSamples: number[] = [];
  for (let i = 0; i < reps + 2; i++) {
    const t0 = performance.now();
    const compiled = compileQuote(s153.yamlText);
    const ir = buildCanonicalQuoteIR(compiled.document, compiled.resources);
    for (const r of compiled.resources) normalizeResourceToCards(r, compiled.document.horizon?.billing_policy);
    partitionResources(ir.resources, "Bench");
    const dt = performance.now() - t0;
    if (i >= 2) cpuSamples.push(dt);
  }
  bottlenecks.push({
    id: "cpu_compiler_pure",
    name: "CPU puro: Compilar + Normalizar + IR + Particionar (153 rec.)",
    category: "cpu",
    scenario: s153.id,
    repetitions: reps,
    median_ms: median(cpuSamples),
    p95_ms: p95(cpuSamples),
    summary: "compileQuote + buildCanonicalQuoteIR + normalizeResourceToCards (213 cartões) + partitionResources (2 shards) sem I/O.",
  });

  // 2. Uncached loadService() YAML reads in validate(q153) vs unique service memoization
  const parsed153 = parse(s153.yamlText);
  const valUncached: number[] = [];
  const valUnique: number[] = [];
  const uniqueServices = [...new Set(parsed153.cards.map(c => String(c.service).toLowerCase()))];
  for (let i = 0; i < reps + 1; i++) {
    clearServiceSchemaCache();
    const t0 = performance.now();
    await validate(parsed153);
    const dt0 = performance.now() - t0;

    clearServiceSchemaCache();
    const t1 = performance.now();
    await Promise.all(uniqueServices.map(s => loadService(s)));
    const dt1 = performance.now() - t1;

    if (i >= 1) {
      valUncached.push(dt0);
      valUnique.push(dt1);
    }
  }
  const vUncMed = median(valUncached);
  const vUniMed = median(valUnique);
  bottlenecks.push({
    id: "schema_yaml_uncached",
    name: "YAML schemas sem cache: validate() (153 cartões vs 1×/serviço)",
    category: "io_cache",
    scenario: s153.id,
    repetitions: reps,
    median_ms: vUncMed,
    p95_ms: p95(valUncached),
    comparison_ms: vUniMed,
    delta_pct: vUncMed > 0 ? round2(((vUniMed - vUncMed) / vUncMed) * 100) : 0,
    summary: `loadService() relê e faz Zod/YAML.parse a cada cartão em validate() e plan(); com 1 leitura por serviço único (${uniqueServices.length}), cai de ${vUncMed} ms para ${vUniMed} ms.`,
  });

  // 3. plan() Disk CatalogCache+Zod vs RAM memoization on 100-resources
  const planDir = await mkdtemp(join(tmpdir(), "autocalc-plan-bench-"));
  const planDiskSamples: number[] = [];
  const planRamSamples: number[] = [];
  try {
    const cache = new CatalogCache(join(planDir, "cache"));
    const reader = new DiskBackedBenchReader(cache, compat, server.baseUrl);
    await reader.seedCache();
    const parsed100 = parse(s100.yamlText);
    const makeCtx = (dDir: string): ActionContext => {
      const cat = new Catalog(reader);
      const prov = new HuaweiProvider({
        skus: (s, r) => cat.skus(s, r),
        checkMode: async (s, r, b) => checkAvailability(await cat.menu(), s, r, b as "ondemand" | "monthly" | "yearly"),
      });
      return {
        reader,
        catalog: cat,
        rating: async () => ({ productRatingResult: [] }),
        lists: { lists: async () => [] } as never,
        auth: {} as never,
        provider: prov,
        drafts: new DraftStore(dDir),
      };
    };

    for (let i = 0; i < reps + 1; i++) {
      clearServiceSchemaCache();
      const d1 = join(planDir, `d-disk-${i}`);
      reader.enableRamMemo(false);
      const t0 = performance.now();
      await plan(makeCtx(d1), parsed100);
      const dt0 = performance.now() - t0;

      clearServiceSchemaCache();
      const d2 = join(planDir, `d-ram-${i}`);
      reader.enableRamMemo(true);
      const t1 = performance.now();
      await plan(makeCtx(d2), parsed100);
      const dt1 = performance.now() - t1;

      if (i >= 1) {
        planDiskSamples.push(dt0);
        planRamSamples.push(dt1);
      }
    }
  } finally {
    await rm(planDir, { recursive: true, force: true });
  }
  const pDiskMed = median(planDiskSamples);
  const pRamMed = median(planRamSamples);
  bottlenecks.push({
    id: "plan_disk_cache_zod",
    name: "plan(): Leitura repetida CatalogCache disco + Zod (100 rec.)",
    category: "io_cache",
    scenario: s100.id,
    repetitions: reps,
    median_ms: pDiskMed,
    p95_ms: p95(planDiskSamples),
    comparison_ms: pRamMed,
    delta_pct: pDiskMed > 0 ? round2(((pRamMed - pDiskMed) / pDiskMed) * 100) : 0,
    summary: `plan() chama CatalogCache.get() do disco + JSON.parse + Zod até 3×/cartão (draftQuote + view + plan loop); só memoizar o leitor em RAM reduz de ${pDiskMed} ms para ${pRamMed} ms (e skus() ainda repete parsing sem cache de SKUs).`,
  });

  // 4. DraftStore + RunRecord serialization overhead (153 reqs, 5 RunRecord.append/req)
  const draftSamples: number[] = [];
  for (let i = 0; i < reps + 1; i++) {
    const tmp = await mkdtemp(join(tmpdir(), "autocalc-draft-bench-"));
    try {
      const store = new DraftStore(tmp);
      const t0 = performance.now();
      const reqs = parsed153.cards.slice(0, 100).map((c, idx) =>
        requirement({
          id: c.id ?? `r${idx}`,
          service: String(c.service),
          region: String(c.region ?? "sa-brazil-1"),
          billing: String(c.billing ?? "monthly"),
          quantity: Number(c.quantity ?? 1),
          options: (c.options as Dict) ?? {},
        }),
      );
      const draft = new Draft(DraftStore.newId(), "Bench", "huawei", reqs);
      await store.save(draft);
      const rr = new RunRecord(tmp, draft.id);
      for (let k = 0; k < reqs.length; k++) {
        draft.addDecision({ requirement_id: reqs[k]!.id, spec: "bench.spec", by: "auto", justification: "bench" });
        await rr.append("bench_step", { k });
      }
      await store.save(draft);
      const dt = performance.now() - t0;
      if (i >= 1) draftSamples.push(dt);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
  bottlenecks.push({
    id: "draft_store_runrecord",
    name: "Serialização DraftStore + 100× RunRecord.append (100 rec.)",
    category: "serialization",
    scenario: s100.id,
    repetitions: reps,
    median_ms: median(draftSamples),
    p95_ms: p95(draftSamples),
    summary: "lockdir fs + 100× (mkdir + appendFile em events.jsonl) + writeFile atomic JSON em DraftStore.",
  });

  // 5. Browser: Fresh Context+Page per card (withAnonymousContext) vs Warm Page reuse (12 cards, sequential)
  const coldCtxSamples: number[] = [];
  const warmPageSamples: number[] = [];
  const dummyCard = makeLoopbackCard({ service: "ecs", region: "sa-brazil-1", billing: "monthly", quantity: 1 }, { template_RENDER: {}, global_REGIONINFO: { region: "sa-brazil-1", chargeMode: "PERIOD" } }, "s6.large.2");
  for (let i = 0; i < 4; i++) {
    const t0 = performance.now();
    for (let k = 0; k < 12; k++) {
      const tok = server.registerCard(dummyCard);
      try {
        await encodeCard(browser, "ecs", dummyCard.rewriteValue, {
          makeDriver: (p, s, opts) => new LoopbackDriver(p, s, `${server.baseUrl}/calc?encode=${tok}#/${s}`, opts),
        });
      } finally {
        server.consumeEncode(tok);
      }
    }
    const dtCold = performance.now() - t0;

    const t1 = performance.now();
    await browser.withAnonymousContext(async context => {
      const page = await context.newPage();
      for (let k = 0; k < 12; k++) {
        const tok = server.registerCard(dummyCard);
        try {
          await page.goto(`${server.baseUrl}/calc?encode=${tok}#/ecs`, { waitUntil: "domcontentloaded" });
          await page.evaluate(() => document.querySelector("#app") !== null);
          await page.click("#rshema_func_priceboard_addToList");
        } finally {
          server.consumeEncode(tok);
        }
      }
    }, { lean: true });
    const dtWarm = performance.now() - t1;

    if (i >= 1) {
      coldCtxSamples.push(dtCold);
      warmPageSamples.push(dtWarm);
    }
  }
  const coldMed = median(coldCtxSamples);
  const warmMed = median(warmPageSamples);
  bottlenecks.push({
    id: "browser_cold_context_overhead",
    name: "Browser encode: Contexto frio por cartão vs Página quente reusada (12×)",
    category: "browser",
    scenario: "loopback-12-cards",
    repetitions: 3,
    median_ms: coldMed,
    p95_ms: p95(coldCtxSamples),
    comparison_ms: warmMed,
    delta_pct: coldMed > 0 ? round2(((warmMed - coldMed) / coldMed) * 100) : 0,
    summary: `withAnonymousContext cria e fecha um BrowserContext por cartão (${coldMed} ms p/ 12); reusar 1 contexto/página leva ${warmMed} ms no loopback Chromium.`,
  });

  // 6. Browser Edit Check: 100-card sequential checkCard loop vs 4 parallel BrowserContexts × 25 cards
  const editSeqSamples: number[] = [];
  const editParSamples: number[] = [];
  const sampleCards100 = Array.from({ length: 100 }, (_, idx) => {
    const card = makeLoopbackCard(
      { service: "rds", region: "sa-brazil-1", billing: "monthly", quantity: 1 },
      { template_RENDER: { spec: { val: idx } }, global_REGIONINFO: { region: "sa-brazil-1", chargeMode: "PERIOD" } },
      "rds.mysql.c6.large.2",
    );
    card.selectedProduct._customTitle = `card_${idx}`;
    return card;
  });
  const payload = sharePayload("edit-bench-100", sampleCards100 as Array<{ selectedProduct: Dict }>);
  const addRes = await fetch(`${server.baseUrl}/api/share/add`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const listId = String(((await addRes.json()) as Dict).data);
  const detailReader = {
    getUncached: async (url: string) => {
      const u = new URL(url);
      const res = await fetch(`${server.baseUrl}/api/share/detail?key=${encodeURIComponent(u.searchParams.get("key") ?? listId)}`);
      return res.json();
    },
  };

  for (let i = 0; i < 4; i++) {
    const t0 = performance.now();
    await editCheck(detailReader, browser, listId, {
      makeDriver: (p, s, opts) => new LoopbackDriver(p, s, `${server.baseUrl}/calc?shareListId=${listId}`, opts),
    });
    const dtSeq = performance.now() - t0;

    const t1 = performance.now();
    const shards = [0, 1, 2, 3].map(w => sampleCards100.map((c, idx) => ({ c, idx })).slice(w * 25, (w + 1) * 25));
    await Promise.all(
      shards.map(slice =>
        browser.withAnonymousContext(async context => {
          const { asPageLike } = await import("../src/core/page/driver.ts");
          const page = asPageLike((await context.newPage()) as never);
          const driver = new LoopbackDriver(page, "shared-list", `${server.baseUrl}/calc?shareListId=${listId}`, { quiet: 0, pollMs: 5 });
          await driver.open();
          await (page as unknown as { getByRole(r: string, o: Dict): { click(): Promise<void> } }).getByRole("button", { name: "View Details" }).click();
          for (const item of slice) await checkCard(driver, item.idx, item.c);
        }, { lean: true }),
      ),
    );
    const dtPar = performance.now() - t1;

    if (i >= 1) {
      editSeqSamples.push(dtSeq);
      editParSamples.push(dtPar);
    }
  }
  const eSeqMed = median(editSeqSamples);
  const eParMed = median(editParSamples);
  bottlenecks.push({
    id: "edit_check_sequential",
    name: "Edit check sequencial (1 página, 100 cartões) vs 4 contextos paralelos",
    category: "browser",
    scenario: "100-resources",
    repetitions: 3,
    median_ms: eSeqMed,
    p95_ms: p95(editSeqSamples),
    comparison_ms: eParMed,
    delta_pct: eSeqMed > 0 ? round2(((eParMed - eSeqMed) / eSeqMed) * 100) : 0,
    summary: `editCheckOnce itera sequencialmente for-of (${eSeqMed} ms no loopback); fatiar em 4 contextos paralelos reduz para ${eParMed} ms preservando verificação idêntica por índice.`,
  });

  return bottlenecks;
}

async function measureConcurrency(
  compat: { menu: unknown; labels: unknown; products: Record<string, unknown> },
  server: LoopbackCalculatorServer,
  browser: BrowserManager,
): Promise<BenchConcurrencyPoint[]> {
  const points: BenchConcurrencyPoint[] = [];
  const workerCounts = [1, 2, 3, 4, 6, 8];
  const cardCount = 24;
  const dummyCard = makeLoopbackCard(
    { service: "ecs", region: "sa-brazil-1", billing: "monthly", quantity: 1 },
    { template_RENDER: {}, global_REGIONINFO: { region: "sa-brazil-1", chargeMode: "PERIOD" } },
    "s6.large.2",
  );
  let baseBrowserMs = 0;

  for (const w of workerCounts) {
    const samples: number[] = [];
    for (let rep = 0; rep < 4; rep++) {
      const items = Array.from({ length: cardCount }, (_, i) => i);
      const t0 = performance.now();
      await mapLimit(items, w, async () => {
        const tok = server.registerCard(dummyCard);
        try {
          return await encodeCard(browser, "ecs", dummyCard.rewriteValue, {
            makeDriver: (p, s, opts) => new LoopbackDriver(p, s, `${server.baseUrl}/calc?encode=${tok}#/${s}`, opts),
          });
        } finally {
          server.consumeEncode(tok);
        }
      });
      const dt = performance.now() - t0;
      if (rep >= 1) samples.push(dt);
    }
    const med = median(samples);
    if (w === 1) baseBrowserMs = med;
    const speedup = baseBrowserMs > 0 ? round2(baseBrowserMs / med) : 1;
    points.push({
      kind: "browser_encode",
      workers: w,
      item_count: cardCount,
      repetitions: 3,
      median_ms: med,
      p95_ms: p95(samples),
      speedup,
      efficiency_pct: round2((speedup / w) * 100),
    });
  }

  // Catalog disk-cache lookup sweep (50 skus calls)
  const cDir = await mkdtemp(join(tmpdir(), "autocalc-cat-conc-"));
  try {
    const cache = new CatalogCache(cDir);
    const reader = new DiskBackedBenchReader(cache, compat, server.baseUrl);
    await reader.seedCache();
    const catalog = new Catalog(reader);
    const lookupPairs: Array<[string, string]> = Array.from({ length: 40 }, (_, i) =>
      i % 2 === 0 ? ["ecs", "sa-brazil-1"] : ["rds", "sa-brazil-1"],
    );
    let baseCatMs = 0;
    for (const w of [1, 2, 4, 8]) {
      const samples: number[] = [];
      for (let rep = 0; rep < 4; rep++) {
        const t0 = performance.now();
        await mapLimit(lookupPairs, w, async ([s, r]) => catalog.skus(s, r));
        const dt = performance.now() - t0;
        if (rep >= 1) samples.push(dt);
      }
      const med = median(samples);
      if (w === 1) baseCatMs = med;
      const speedup = baseCatMs > 0 ? round2(baseCatMs / med) : 1;
      points.push({
        kind: "catalog_lookup",
        workers: w,
        item_count: lookupPairs.length,
        repetitions: 3,
        median_ms: med,
        p95_ms: p95(samples),
        speedup,
        efficiency_pct: round2((speedup / w) * 100),
      });
    }
  } finally {
    await rm(cDir, { recursive: true, force: true });
  }

  return points;
}

class LiveRamMemoReader {
  private memo: Map<string, unknown> | null = null;
  constructor(private readonly base: PublicTransport) {}

  enableRam(enable: boolean): void {
    this.memo = enable ? new Map() : null;
  }

  async get(url: string, options?: { mirror?: string; refresh?: boolean }): Promise<unknown> {
    if (!options?.refresh && this.memo?.has(url)) return this.memo.get(url);
    const val = await this.base.get(url, options);
    if (this.memo && !options?.refresh) this.memo.set(url, val);
    return val;
  }

  getUncached(url: string): Promise<unknown> {
    return this.base.getUncached(url);
  }
}

interface LiveScenarioDef {
  id: string;
  label: string;
  yamlText: string;
  expectedResources: number;
  expectedCards: number;
  expectedShards: number;
}

function buildLiveScenarios(runTag: string): LiveScenarioDef[] {
  const mkYaml = (id: string, titlePrefix: string, resourcesYaml: string) => `version: "1"
metadata: { id: "${id}", customer: "Autocalc Live Bench", title_prefix: "${titlePrefix}", currency: "USD" }
horizon: { duration: "1m", billing_policy: "as-specified" }
defaults: { provider: "huawei", region: "sa-brazil-1", billing: "monthly" }
resources:
${resourcesYaml}`;

  const r1 = `  - { id: "r01-cce", service: "cce", quantity: 1, options: { cluster_type: "standard", ha: true, scale: "small" } }\n`;
  const r5 =
    r1 +
    `  - { id: "r02-evs-sas", service: "evs", quantity: 1, options: { type: "SAS", size_gb: "100 GB" } }
  - { id: "r03-evs-ssd", service: "evs", quantity: 1, options: { type: "SSD", size_gb: "200 GB" } }
  - { id: "r04-nat-s", service: "nat", billing: "ondemand", options: { size: "S" } }
  - { id: "r05-kafka", service: "kafka", quantity: 1, options: { spec_id: "c6.2u4g.cluster", brokers: 3, storage_gb: "200 GB", storage_type: "ultra" } }\n`;
  const r10 =
    r5 +
    `  - { id: "r04b-evs-gpssd", service: "evs", quantity: 1, options: { type: "GPSSD", size_gb: "150 GB" } }
  - { id: "r06-nat-m", service: "nat", billing: "ondemand", options: { size: "M" } }
  - { id: "r07-elb", service: "elb", billing: "ondemand", quantity: 1, options: { network_type: "Public network", billing_mode: "traffic", public_ip_count: 1 } }
  - { id: "r09-rabbit", service: "rabbitmq", quantity: 1, options: { spec_id: "c6.2u4g.cluster", version: "3.8", brokers: 3, storage_gb: "200 GB", storage_type: "ultra" } }
  - { id: "r10-evs-sas2", service: "evs", quantity: 1, options: { type: "SAS", size_gb: "300 GB" } }\n`;

  return [
    { id: "1-resource", label: "1 recurso live (CCE)", yamlText: mkYaml("live-1r", `BenchLive-${runTag}-1r`, r1), expectedResources: 1, expectedCards: 1, expectedShards: 1 },
    { id: "5-resources", label: "5 recursos live (CCE/EVS/NAT/Kafka)", yamlText: mkYaml("live-5r", `BenchLive-${runTag}-5r`, r5), expectedResources: 5, expectedCards: 5, expectedShards: 1 },
    { id: "10-resources", label: "10 recursos live (Multi-serviço)", yamlText: mkYaml("live-10r", `BenchLive-${runTag}-10r`, r10), expectedResources: 10, expectedCards: 10, expectedShards: 1 },
  ];
}

async function runLiveBenchmark(
  repetitions: number,
  warmup: number,
  scenarioFilter: string[] | null,
): Promise<BenchRunResult> {
  const rowListId = (row: Record<string, unknown>) => String(row.key ?? row.id ?? "");
  const runTag = randomUUID().slice(0, 8);
  const tmpRoot = await mkdtemp(join(tmpdir(), `autocalc-bench-live-${runTag}-`));
  const cacheDir = process.env.AUTOCALC_CACHE ?? join(homedir(), ".cache", "autocalc");
  const transport = new PublicTransport(new CatalogCache(cacheDir));
  const planCacheTransport = new PublicTransport(new CatalogCache(join(tmpRoot, "plan-cache")));
  const config = resolveConfig({ headed: false });
  const paths = profilePaths(config.profile!);
  const browser = new BrowserManager({
    profilePath: paths.profileDir,
    headed: config.headed,
    ...(config.executable ? { executable: config.executable } : {}),
  });
  const auth = new AuthManager({
    profile: config.profile!,
    ...paths,
    headed: config.headed,
    browser,
    ...(config.executable ? { executable: config.executable } : {}),
  });
  const baseLists = new ListSession(
    (method, url, body) => auth.call(method, url, body),
    () => auth.refresh(),
  );

  // Verify live session immediately and snapshot pre-existing list IDs for strict orphan cleanup.
  let beforeRows: Array<Record<string, unknown>>;
  try {
    beforeRows = (await baseLists.lists()) as Array<Record<string, unknown>>;
  } catch (error) {
    await auth.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await planCacheTransport.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  const beforeIds = new Set(beforeRows.map(rowListId).filter(Boolean));
  const createdIds = new Set<string>();

  const trackedLists: Pick<ListSession, "lists" | "create" | "update" | "delete" | "copy"> = {
    lists: () => baseLists.lists(),
    create: async payload => {
      const id = await baseLists.create(payload);
      createdIds.add(id);
      return id;
    },
    update: (id, payload) => baseLists.update(id, payload),
    delete: async id => {
      await baseLists.delete(id);
      createdIds.delete(id);
    },
    copy: async id => {
      const copyId = await baseLists.copy(id);
      createdIds.add(copyId);
      return copyId;
    },
  };

  const stageIds: BenchStageId[] = ["compilar", "normalizar", "pagina", "salvar", "rating", "edit", "publicar"];
  const allLiveSpecs = buildLiveScenarios(runTag);
  const specs = scenarioFilter ? allLiveSpecs.filter(s => scenarioFilter.includes(s.id)) : allLiveSpecs;
  if (!specs.length) {
    throw new CalculatorError("VALIDATION", `Nenhum cenário live encontrado para --scenarios=${scenarioFilter?.join(",")}`);
  }

  try {
    const catalog = new Catalog(transport);
    const provider = new HuaweiProvider({
      skus: (s, r) => catalog.skus(s, r),
      checkMode: async (s, r, b) => checkAvailability(await catalog.menu(), s, r, b as "ondemand" | "monthly" | "yearly"),
    });
    const rate: ActionContext["rating"] = body => inquiry(value => transport.post(RATE, value), body);

    const buildFormInput = async (input: Record<string, unknown>) =>
      String(input.service) in RECIPES
        ? buildRecipe(String(input.service), input as never).rewriteValue
        : (await inFormOnlyMode(() =>
            buildServiceCard(input as never, {
              productInfo: (service, region) => catalog.productInfo(service, region),
              rate: async () => {
                throw new CalculatorError("AUTOCALC", "A form-only build must not rate.");
              },
            }),
          )).rewriteValue as Dict;

    const encodeCardLiveWithOpenRetry = async (service: string, rewriteValue: Dict) => {
      try {
        return await encodeCard(browser, service, rewriteValue);
      } catch (err) {
        if (err instanceof CalculatorError && err.code === "PAGE_ENCODE_FAILED" && (err.details as Dict)?.step === "open") {
          console.error(`[bench:live] open retry para encodeCard(${service}): ${err.message}`);
          return encodeCard(browser, service, rewriteValue);
        }
        throw err;
      }
    };

    const scenarios: BenchScenarioResult[] = [];
    const editSeqSamples: number[] = [];
    const editParSamples: number[] = [];
    const liveNotes: string[] = [];

    for (const spec of specs) {
      console.error(`[bench:live] Experimento A: ${spec.id} (${spec.expectedResources} rec / ${spec.expectedCards} cartoes, warmup=${warmup}, reps=${repetitions})...`);
      const samplesByStage = Object.fromEntries(stageIds.map(s => [s, [] as number[]])) as Record<BenchStageId, number[]>;
      const totalSamples: number[] = [];

      for (let runIdx = 0; runIdx < warmup + repetitions; runIdx++) {
        const isWarmup = runIdx < warmup;
        let savedListForPar: string | null = null;
        let savedEditSeqMs = 0;

        for (let attempt = 0; attempt < 2; attempt++) {
          const runDir = join(tmpRoot, `expA-${spec.id}-${runIdx}-a${attempt}`);
          await mkdir(runDir, { recursive: true });
          let createdListId: string | null = null;

          try {
            const quotePath = join(runDir, "quote.yaml");
            const repYaml = spec.yamlText.replace(`BenchLive-${runTag}`, `BenchLive-${runTag}-r${runIdx}`);
            await writeFile(quotePath, repYaml, "utf8");

            const stageMs = Object.fromEntries(stageIds.map(s => [s, 0])) as Record<BenchStageId, number>;
            let currentStage: BenchStageId = "normalizar";
            let phaseStart = 0;
            const switchStage = (next: BenchStageId) => {
              const now = performance.now();
              stageMs[currentStage] += now - phaseStart;
              currentStage = next;
              phaseStart = now;
            };

            const drafts = new DraftStore(join(runDir, "drafts"));
            const ctx: ActionContext = {
              reader: transport,
              catalog,
              rating: rate,
              lists: trackedLists,
              auth: auth as never,
              provider,
              drafts,
              publish: {
                form: async input => {
                  if (currentStage !== "pagina") switchStage("pagina");
                  return buildFormInput(input);
                },
                encode: (service, rewriteValue) => encodeCardLiveWithOpenRetry(service, rewriteValue),
                publish: async (name, cards, options) => {
                  switchStage("salvar");
                  let ratingStarted = false;
                  const out = await publishChecked(name, cards, {
                    lists: trackedLists,
                    settlement: options.settlement,
                    currency: options.currency,
                    check: async (listId, expected) => {
                      const instrumentedRate: typeof rate = async body => {
                        if (!ratingStarted) {
                          ratingStarted = true;
                          switchStage("rating");
                        }
                        return rate(body);
                      };
                      const res = await verify(
                        listId,
                        {
                          reader: transport,
                          rate: instrumentedRate,
                          edit: async lid => {
                            switchStage("edit");
                            const editRes = await editCheck(transport, browser, lid);
                            switchStage("publicar");
                            return editRes;
                          },
                        },
                        expected,
                      );
                      if (currentStage !== "publicar") switchStage("publicar");
                      return res;
                    },
                  });
                  createdListId = out.id;
                  return out;
                },
                liveVersion: () => liveVersion(),
              },
            };

            const tCompile0 = performance.now();
            const parsedQuote = parse(repYaml, quotePath);
            const valIssues = await validate(parsedQuote);
            if (valIssues.length) throw new Error(`Validation failed for live ${spec.id}: ${JSON.stringify(valIssues)}`);
            stageMs.compilar = performance.now() - tCompile0;

            currentStage = "normalizar";
            phaseStart = performance.now();
            const applied = await apply(ctx, parsedQuote);
            stageMs[currentStage] += performance.now() - phaseStart;

            if (!applied.url || !createdListId) {
              throw new Error(`Expected live published URL & listId for ${spec.id}`);
            }

            if (!isWarmup) {
              for (const id of stageIds) samplesByStage[id].push(stageMs[id]);
              const tot = stageIds.reduce((acc, s) => acc + stageMs[s], 0);
              totalSamples.push(tot);
              console.error(`[bench:live]   rep ${runIdx - warmup + 1}/${repetitions}: total=${round2(tot)}ms (pagina=${round2(stageMs.pagina)}ms, edit=${round2(stageMs.edit)}ms)`);
            }

            if (spec.id === "10-resources" && !isWarmup && createdListId) {
              savedListForPar = createdListId;
              savedEditSeqMs = stageMs.edit;
              createdListId = null; // Handled & deleted in dedicated Experiment B1 finally block below.
            }
            break;
          } catch (err) {
            if (err instanceof CalculatorError) {
              console.error(`[bench:live] erro detalhado (${spec.id}, attempt=${attempt + 1}):`, err.message, JSON.stringify(err.details));
            } else {
              console.error(`[bench:live] erro (${spec.id}, attempt=${attempt + 1}):`, err);
            }
            if (attempt === 0) {
              console.error("[bench:live] Retentando repeticao apos falha transiente do portal...");
              continue;
            }
            throw err;
          } finally {
            if (createdListId) {
              await trackedLists.delete(createdListId).catch(() => undefined);
            }
            await rm(runDir, { recursive: true, force: true }).catch(() => undefined);
          }
        }

        // Decoupled Experiment B1 probe on the live 10-card list before deleting it.
        if (savedListForPar) {
          const targetListId = savedListForPar;
          try {
            console.error(`[bench:live] Experimento B1 (edit_check paralelo 3x) na lista ${targetListId}...`);
            const tPar0 = performance.now();
            const detailCards = (await shareDetail(transport, targetListId)).cartListData as Dict[];
            const slices = [
              detailCards.map((c, idx) => ({ c, idx })).slice(0, 4),
              detailCards.map((c, idx) => ({ c, idx })).slice(4, 7),
              detailCards.map((c, idx) => ({ c, idx })).slice(7, 10),
            ].filter(slice => slice.length > 0);
            const runSliceOnce = async (slice: Array<{ c: Dict; idx: number }>) =>
              browser.withAnonymousContext(async context => {
                const page = asPageLike((await context.newPage()) as never);
                const driver = new Driver(page, "shared-list", { timeout: 12 });
                try {
                  await driver.open(shareLink(targetListId));
                  await driver.settle();
                  await js(page, "removeOverlays", OVERLAYS);
                  await (page as unknown as { getByRole(r: string, o: Dict): { click(opts?: Dict): Promise<void> } })
                    .getByRole("button", { name: "View Details" })
                    .click({ timeout: driver.timeout * 1000 });
                } catch (openErr) {
                  return { openFailed: true as const, error: openErr, results: [] as EditResult[] };
                }
                const out: EditResult[] = [];
                for (const item of slice) out.push(await checkCard(driver, item.idx, item.c));
                return { openFailed: false as const, error: null, results: out };
              }, { lean: true });

            const parResults = (
              await Promise.all(
                slices.map(async (slice, sliceIdx) => {
                  if (sliceIdx > 0) await new Promise(r => setTimeout(r, sliceIdx * 1500));
                  let workerAttempt = await runSliceOnce(slice);
                  if (workerAttempt.openFailed) {
                    console.error(`[bench:live]   slice ${sliceIdx + 1}: openFailed, retentando 1x...`);
                    workerAttempt = await runSliceOnce(slice);
                  }
                  if (workerAttempt.openFailed) throw workerAttempt.error;
                  return workerAttempt.results;
                }),
              )
            ).flat();
            const dtPar = performance.now() - tPar0;
            if (parResults.length !== detailCards.length || !parResults.every(r => r.equal)) {
              throw new Error(`Parallel live editCheck mismatch/failure on ${targetListId}: ${JSON.stringify(parResults)}`);
            }
            editSeqSamples.push(savedEditSeqMs);
            editParSamples.push(dtPar);
            console.error(`[bench:live]   edit_check seq=${round2(savedEditSeqMs)}ms vs 3x paralelo=${round2(dtPar)}ms`);
          } catch (parErr) {
            const msg = parErr instanceof CalculatorError
              ? `${parErr.message} ${JSON.stringify(parErr.details)}`
              : parErr instanceof Error ? parErr.message : String(parErr);
            console.error(`[bench:live] Experimento B1 (edit_check paralelo 3x) falhou sem abortar benchmark: ${msg}`);
            liveNotes.push(`edit_check_parallel_3x_failed: ${msg}`);
          } finally {
            await trackedLists.delete(targetListId).catch(() => undefined);
          }
        }
      }

      const totalMedian = median(totalSamples);
      const stages: BenchStageMetrics[] = stageIds.map(id => {
        const samples = samplesByStage[id].map(round2);
        const med = median(samples);
        return {
          stage: id,
          label: STAGE_LABELS[id],
          samples_ms: samples,
          median_ms: med,
          p95_ms: p95(samples),
          share_pct: totalMedian > 0 ? round2((med / totalMedian) * 100) : 0,
        };
      });

      scenarios.push({
        id: spec.id,
        label: spec.label,
        resource_count: spec.expectedResources,
        card_count: spec.expectedCards,
        shard_count: spec.expectedShards,
        warmup,
        repetitions,
        total_median_ms: totalMedian,
        total_p95_ms: p95(totalSamples),
        stages,
      });
      console.error(`[bench:live]   -> ${spec.id} mediana=${totalMedian}ms p95=${p95(totalSamples)}ms`);
    }

    // Live Experiment B (isolated bottlenecks)
    const bottlenecks: BenchBottleneckItem[] = [];
    const tenSpec = allLiveSpecs.find(s => s.id === "10-resources")!;
    const tenMed = scenarios.find(s => s.id === "10-resources")?.total_median_ms;

    if (editSeqSamples.length && editParSamples.length) {
      const eSeqMed = median(editSeqSamples);
      const eParMed = median(editParSamples);
      bottlenecks.push({
        id: "edit_check_sequential",
        name: "Live Edit check sequencial (1 página, 10 cartões) vs 3 contextos paralelos",
        category: "browser",
        scenario: "10-resources",
        repetitions: editSeqSamples.length,
        median_ms: eSeqMed,
        p95_ms: p95(editSeqSamples),
        comparison_ms: eParMed,
        delta_pct: eSeqMed > 0 ? round2(((eParMed - eSeqMed) / eSeqMed) * 100) : 0,
        ...(tenMed && tenMed > 0 ? { share_of_total_pct: round2((eSeqMed / tenMed) * 100) } : {}),
        summary: `editCheckOnce live em 10 cartões reais (${eSeqMed} ms) vs 3 BrowserContexts paralelos (${eParMed} ms) com aprovação idêntica de todos os 10 cartões.`,
      });
    }

    // Live Experiment B2: Cold BrowserContext per card vs Warm Page reuse (3 real cards: cce, evs, nat)
    console.error("[bench:live] Experimento B (browser_cold_context_overhead: 3 cartoes ao vivo)...");
    const threeInputs: Array<{ service: string; rewriteValue: Dict }> = [
      { service: "cce", rewriteValue: await buildFormInput({ service: "cce", region: "sa-brazil-1", billing: "monthly", quantity: 1, cluster_type: "standard", ha: true, scale: "small" }) },
      { service: "evs", rewriteValue: await buildFormInput({ service: "evs", region: "sa-brazil-1", billing: "monthly", quantity: 1, type: "SAS", size_gb: 100 }) },
      { service: "nat", rewriteValue: await buildFormInput({ service: "nat", region: "sa-brazil-1", billing: "ondemand", quantity: 1, size: "small" }) },
    ];
    const coldLiveSamples: number[] = [];
    const warmLiveSamples: number[] = [];
    for (let rep = 0; rep < 1; rep++) {
      const tCold0 = performance.now();
      for (const item of threeInputs) {
        await encodeCardLiveWithOpenRetry(item.service, item.rewriteValue);
      }
      coldLiveSamples.push(performance.now() - tCold0);

      const tWarm0 = performance.now();
      await browser.withAnonymousContext(async context => {
        let page = await context.newPage();
        for (let idx = 0; idx < threeInputs.length; idx++) {
          const item = threeInputs[idx]!;
          const pageSvc = PAGE_SERVICE[item.service] ?? item.service;
          let driver = new Driver(asPageLike(page as never), pageSvc);
          for (let openTry = 0; openTry < 2; openTry++) {
            try {
              if (idx > 0 || openTry > 0) await page.goto("about:blank");
              await driver.open();
              break;
            } catch (openErr) {
              if (
                openTry === 0 &&
                openErr instanceof CalculatorError &&
                openErr.code === "PAGE_ENCODE_FAILED" &&
                (openErr.details as Dict)?.step === "open"
              ) {
                console.error(`[bench:live] open retry na pagina quente (${item.service}): ${openErr.message}`);
                await page.close().catch(() => undefined);
                page = await context.newPage();
                driver = new Driver(asPageLike(page as never), pageSvc);
                continue;
              }
              throw openErr;
            }
          }
          await driver.run(cardSteps(forPage(item.service, item.rewriteValue)));
          await driver.capture();
        }
      }, { lean: true });
      warmLiveSamples.push(performance.now() - tWarm0);
    }
    const coldLiveMed = median(coldLiveSamples);
    const warmLiveMed = median(warmLiveSamples);
    bottlenecks.push({
      id: "browser_cold_context_overhead",
      name: "Live encode: Contexto frio por cartão vs Página quente reusada (3×)",
      category: "browser",
      scenario: "live-3-cards",
      repetitions: 1,
      median_ms: coldLiveMed,
      p95_ms: p95(coldLiveSamples),
      comparison_ms: warmLiveMed,
      delta_pct: coldLiveMed > 0 ? round2(((warmLiveMed - coldLiveMed) / coldLiveMed) * 100) : 0,
      summary: `encodeCard criando BrowserContext frio por cartão ao vivo (${coldLiveMed} ms p/ 3) vs reuso de 1 BrowserContext+Page (${warmLiveMed} ms).`,
    });

    // Live Experiment B3: plan_disk_cache_zod (10-resources live cached on disk vs RAM memoization)
    console.error("[bench:live] Experimento B (plan_disk_cache_zod e schema_yaml_uncached em 10-resources)...");
    const memoReader = new LiveRamMemoReader(planCacheTransport);
    const memoCatalog = new Catalog(memoReader);
    const memoProvider = new HuaweiProvider({
      skus: (s, r) => memoCatalog.skus(s, r),
      checkMode: async (s, r, b) => checkAvailability(await memoCatalog.menu(), s, r, b as "ondemand" | "monthly" | "yearly"),
    });
    const parsed10 = parse(tenSpec.yamlText);
    const planWarmDir = join(tmpRoot, "plan-warm");
    await mkdir(planWarmDir, { recursive: true });
    // Ensure disk cache is warm before comparing disk-Zod vs RAM memoization
    await plan({
      reader: memoReader,
      catalog: memoCatalog,
      rating: rate,
      lists: trackedLists,
      auth: auth as never,
      provider: memoProvider,
      drafts: new DraftStore(planWarmDir),
    }, parsed10);

    const diskPlanSamples: number[] = [];
    const ramPlanSamples: number[] = [];
    for (let i = 0; i < 3; i++) {
      memoReader.enableRam(false);
      const t0 = performance.now();
      await plan({
        reader: memoReader,
        catalog: memoCatalog,
        rating: rate,
        lists: trackedLists,
        auth: auth as never,
        provider: memoProvider,
        drafts: new DraftStore(join(tmpRoot, `plan-disk-${i}`)),
      }, parsed10);
      diskPlanSamples.push(performance.now() - t0);

      memoReader.enableRam(true);
      const t1 = performance.now();
      await plan({
        reader: memoReader,
        catalog: memoCatalog,
        rating: rate,
        lists: trackedLists,
        auth: auth as never,
        provider: memoProvider,
        drafts: new DraftStore(join(tmpRoot, `plan-ram-${i}`)),
      }, parsed10);
      ramPlanSamples.push(performance.now() - t1);
    }
    const diskPlanMed = median(diskPlanSamples);
    const ramPlanMed = median(ramPlanSamples);
    bottlenecks.push({
      id: "plan_disk_cache_zod",
      name: "Live plan(): CatalogCache disco + Zod vs memoização RAM (10 rec.)",
      category: "io_cache",
      scenario: "10-resources",
      repetitions: 3,
      median_ms: diskPlanMed,
      p95_ms: p95(diskPlanSamples),
      comparison_ms: ramPlanMed,
      delta_pct: diskPlanMed > 0 ? round2(((ramPlanMed - diskPlanMed) / diskPlanMed) * 100) : 0,
      ...(tenMed && tenMed > 0 ? { share_of_total_pct: round2((diskPlanMed / tenMed) * 100) } : {}),
      summary: `plan() live com cache de disco aquecido + Zod (${diskPlanMed} ms) vs memoização em RAM (${ramPlanMed} ms).`,
    });

    // Live Experiment B4: schema_yaml_uncached on 10-resources
    const uniqueLiveSvcs = [...new Set(parsed10.cards.map(c => String(c.service).toLowerCase()))];
    const valUncSamples: number[] = [];
    const valUniSamples: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      await validate(parsed10);
      valUncSamples.push(performance.now() - t0);
      const t1 = performance.now();
      await Promise.all(uniqueLiveSvcs.map(s => loadService(s)));
      valUniSamples.push(performance.now() - t1);
    }
    const vLiveUncMed = median(valUncSamples);
    const vLiveUniMed = median(valUniSamples);
    bottlenecks.push({
      id: "schema_yaml_uncached",
      name: "Live validate(): YAML schemas sem cache (10 cartões vs 1×/serviço)",
      category: "io_cache",
      scenario: "10-resources",
      repetitions: 3,
      median_ms: vLiveUncMed,
      p95_ms: p95(valUncSamples),
      comparison_ms: vLiveUniMed,
      delta_pct: vLiveUncMed > 0 ? round2(((vLiveUniMed - vLiveUncMed) / vLiveUncMed) * 100) : 0,
      ...(tenMed && tenMed > 0 ? { share_of_total_pct: round2((vLiveUncMed / tenMed) * 100) } : {}),
      summary: `validate() relê YAML por cartão (${vLiveUncMed} ms para 10 cartões) vs 1 leitura por serviço único (${uniqueLiveSvcs.length} serviços = ${vLiveUniMed} ms).`,
    });

    // Live Experiment C: browser_encode scaling (workers = 1, 2, 4 across 4 live cards, reps = 1)
    console.error("[bench:live] Experimento C (browser_encode live com workers = 1, 2, 4 em 4 cartoes)...");
    const concurrency: BenchConcurrencyPoint[] = [];
    const fourCards: Array<{ service: string; rewriteValue: Dict }> = [
      threeInputs[1]!, // evs SAS
      { service: "evs", rewriteValue: await buildFormInput({ service: "evs", region: "sa-brazil-1", billing: "monthly", quantity: 1, type: "SSD", size_gb: 200 }) },
      threeInputs[2]!, // nat small
      threeInputs[0]!, // cce small
    ];
    let liveBaseMs = 0;
    for (const w of [1, 2, 4]) {
      try {
        const t0 = performance.now();
        await mapLimit(fourCards, w, async item => encodeCardLiveWithOpenRetry(item.service, item.rewriteValue));
        const dt = round2(performance.now() - t0);
        if (w === 1) liveBaseMs = dt;
        const speedup = liveBaseMs > 0 ? round2(liveBaseMs / dt) : 1;
        concurrency.push({
          kind: "browser_encode",
          workers: w,
          item_count: fourCards.length,
          repetitions: 1,
          median_ms: dt,
          p95_ms: dt,
          speedup,
          efficiency_pct: round2((speedup / w) * 100),
        });
        console.error(`[bench:live]   workers=${w}: ${dt}ms (speedup=${speedup}x)`);
      } catch (concErr) {
        const msg = concErr instanceof CalculatorError
          ? `${concErr.message} ${JSON.stringify(concErr.details)}`
          : concErr instanceof Error ? concErr.message : String(concErr);
        console.error(`[bench:live] Experimento C workers=${w} falhou sem abortar benchmark: ${msg}`);
        liveNotes.push(`concurrency_workers_${w}_failed: ${msg}`);
      }
    }

    const git = gitInfo();
    return {
      schema_version: "1.0.0",
      timestamp: new Date().toISOString(),
      mode: "live",
      metadata: {
        ...git,
        os_platform: process.platform,
        os_release: release(),
        arch: process.arch,
        cpu_model: cpus()[0]?.model ?? "unknown",
        cpu_count: availableParallelism(),
        total_mem_mb: Math.round(totalmem() / (1024 * 1024)),
        free_mem_mb: Math.round(freemem() / (1024 * 1024)),
        bun_version: Bun.version,
        warmup,
        repetitions,
        encode_workers_default: encodeWorkers(),
        rating_workers_default: RATING_WORKERS,
      },
      scenarios,
      bottlenecks,
      concurrency,
      ...(liveNotes.length ? { notes: liveNotes } : {}),
    };
  } finally {
    // Strict orphan cleanup on the Huawei Cloud account
    for (const id of [...createdIds]) {
      await trackedLists.delete(id).catch(() => undefined);
    }
    try {
      const remaining = (await baseLists.lists()) as Array<Record<string, unknown>>;
      const ownOrphans = remaining.filter(
        row => !beforeIds.has(rowListId(row)) && String(row.name ?? "").includes(`BenchLive-${runTag}`),
      );
      for (const orphan of ownOrphans) {
        const id = rowListId(orphan);
        if (id) await baseLists.delete(id).catch(() => undefined);
      }
      const afterCheck = (await baseLists.lists()) as Array<Record<string, unknown>>;
      const leftovers = afterCheck.filter(
        row => !beforeIds.has(rowListId(row)) && String(row.name ?? "").includes(`BenchLive-${runTag}`),
      );
      if (leftovers.length > 0) {
        console.error(`[bench:live] AVISO: restaram ${leftovers.length} listas temporarias: ${JSON.stringify(leftovers)}`);
      } else {
        console.error(`[bench:live] Limpeza verificada: 0 listas temporarias remanescentes (total na conta: ${afterCheck.length}).`);
      }
    } catch (cleanupErr) {
      console.error("[bench:live] Erro ao verificar limpeza final:", cleanupErr);
    }
    await auth.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await planCacheTransport.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let repetitions = 3;
  let warmup = 1;
  let repsExplicit = false;
  let warmupExplicit = false;
  let writeBaseline = false;
  let live = false;
  let scenarioFilter: string[] | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--repetitions" && args[i + 1]) { repetitions = Math.max(1, Number(args[++i])); repsExplicit = true; continue; }
    if (a === "--warmup" && args[i + 1]) { warmup = Math.max(0, Number(args[++i])); warmupExplicit = true; continue; }
    if (a === "--baseline") { writeBaseline = true; continue; }
    if (a === "--live") { live = true; continue; }
    if (a === "--scenarios" && args[i + 1]) { scenarioFilter = args[++i]!.split(",").map(s => s.trim()).filter(Boolean); continue; }
  }

  let result: BenchRunResult;
  if (live) {
    const liveReps = repsExplicit ? repetitions : 1;
    const liveWarmup = warmupExplicit ? warmup : 0;
    console.error(`[bench] Modo LIVE selecionado (warmup=${liveWarmup}, reps=${liveReps})...`);
    result = await runLiveBenchmark(liveReps, liveWarmup, scenarioFilter);
  } else {
    console.error("[bench] Montando cenarios de 1..153 recursos...");
    const allSpecs = await buildBenchScenarios();
    const specs = scenarioFilter ? allSpecs.filter(s => scenarioFilter!.includes(s.id)) : allSpecs;
    console.error("[bench] Carregando fixtures compat offline...");
    const compat = {
      menu: JSON.parse(await readFile(join(COMPAT_DIR, "menu.json"), "utf8")) as unknown,
      labels: JSON.parse(await readFile(join(COMPAT_DIR, "labels.json"), "utf8")) as unknown,
      products: JSON.parse(await readFile(join(COMPAT_DIR, "products.json"), "utf8")) as Record<string, unknown>,
    };

    const server = new LoopbackCalculatorServer();
    const browser = new BrowserManager({ headed: false });
    try {
      const scenarios: BenchScenarioResult[] = [];
      for (const spec of specs) {
        console.error(`[bench] Experimento A: ${spec.id} (${spec.expectedResources} rec / ${spec.expectedCards} cartoes / ${spec.expectedShards} shards, warmup=${warmup}, reps=${repetitions})...`);
        const measured = await measureOfflineScenario(spec, compat, server, browser, warmup, repetitions);
        scenarios.push(measured);
        console.error(`[bench]   -> total mediana=${measured.total_median_ms}ms p95=${measured.total_p95_ms}ms`);
      }

      console.error("[bench] Experimento B: Isolando gargalos...");
      const bottlenecks = await measureBottlenecks(allSpecs, compat, server, browser);
      const ref100 = scenarios.find(s => s.id === "100-resources")?.total_median_ms;
      const ref153 = scenarios.find(s => s.id === "153-resources-multishard")?.total_median_ms;
      for (const b of bottlenecks) {
        const denom = b.scenario === "153-resources-multishard" ? ref153 : b.scenario === "100-resources" ? ref100 : undefined;
        if (denom && denom > 0) b.share_of_total_pct = round2((b.median_ms / denom) * 100);
      }

      console.error("[bench] Experimento C: Varredura de concorrencia (workers = 1, 2, 3, 4, 6, 8)...");
      const concurrency = await measureConcurrency(compat, server, browser);

      const git = gitInfo();
      result = {
        schema_version: "1.0.0",
        timestamp: new Date().toISOString(),
        mode: "offline",
        metadata: {
          ...git,
          os_platform: process.platform,
          os_release: release(),
          arch: process.arch,
          cpu_model: cpus()[0]?.model ?? "unknown",
          cpu_count: availableParallelism(),
          total_mem_mb: Math.round(totalmem() / (1024 * 1024)),
          free_mem_mb: Math.round(freemem() / (1024 * 1024)),
          bun_version: Bun.version,
          warmup,
          repetitions,
          encode_workers_default: encodeWorkers(),
          rating_workers_default: RATING_WORKERS,
        },
        scenarios,
        bottlenecks,
        concurrency,
      };
    } finally {
      await browser.close();
      server.stop();
    }
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  const fileStamp = result.timestamp.replace(/[:.]/g, "-");
  const outPath = join(RESULTS_DIR, `${fileStamp}.json`);
  const payload = JSON.stringify(result, null, 2) + "\n";
  await writeFile(outPath, payload, "utf8");
  console.error(`[bench] Resultado gravado em ${outPath}`);

  const baselineTarget = live ? BASELINE_LIVE_PATH : BASELINE_PATH;
  if (writeBaseline || !(await Bun.file(baselineTarget).exists())) {
    await cp(outPath, baselineTarget);
    console.error(`[bench] Baseline gravado em ${baselineTarget}`);
  }
}

await main();
