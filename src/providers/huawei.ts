/** HuaweiProvider: the core's view of today's catalog, availability and list prices. */
import { candidate, invalid, type Candidate, type Requirement } from "../core/quote/model.ts";
import type { Provider } from "../core/quote/provider.ts";

const BILLING = ["ondemand", "monthly", "yearly"];
/** Same set as USAGE_PRICED in core/services/publication.ts, kept here so the provider does not import the services layer. */
const USAGE_PRICED = new Set(["obs", "dss", "memcached", "maas"]);
/** Services where a named spec outside the primary group is accepted without a list price. */
const UNLISTED_PRICE = new Set(["vpn"]);

export interface CatalogSku { group: string; spec: string; description: string; prices: Record<string, { amount: number }>; offPage?: boolean }
export interface HuaweiSource {
  skus(service: string, region: string): Promise<CatalogSku[]>;
  /** Throws SERVICE_NOT_SOLD / MODE_NOT_OFFERED when the region or billing mode cannot serve the service. */
  checkMode(service: string, region: string, billing: string): Promise<void>;
}

/** Python's _parse_compute: vCPU count and memory in GB from the catalog description. */
export function parseCompute(description: string): { vcpus?: number; memory_gb?: number } {
  const v = /\b(?:vCPUs?|CPU|cpu):\s*([\d.]+)/.exec(description);
  const mMb = /\b(?:Memory|mem|memery|capacity):\s*([\d.]+)\s*MB\b/i.exec(description);
  const mGb = !mMb ? /\b(?:Memory|mem|memery|capacity):\s*([\d.]+)\s*GB\b/i.exec(description) : null;
  return {
    ...(v ? { vcpus: Number(v[1]) } : {}),
    ...(mMb ? { memory_gb: Number(mMb[1]) / 1024 } : mGb ? { memory_gb: Number(mGb[1]) } : {}),
  };
}

export class HuaweiProvider implements Provider {
  readonly name = "huawei";
  constructor(private readonly source: HuaweiSource) {}

  async prices(req: Requirement, spec: string): Promise<Record<string, number> | null> {
    const sku = (await this.source.skus(req.service, req.region)).find(item => item.spec === spec);
    return sku ? Object.fromEntries(Object.entries(sku.prices).map(([mode, plan]) => [mode, Number(plan.amount)])) : null;
  }

  async candidates(req: Requirement): Promise<Candidate[]> {
    // ECS RI: the spec is chosen from the monthly catalog; the ECS builder rates the RI plan itself at publish time
    const ri = req.billing === "ri" && req.service.toLowerCase() === "ecs";
    if (!BILLING.includes(req.billing) && !ri) throw invalid(`Billing '${req.billing}' is not supported here.`, "billing", BILLING);
    await this.source.checkMode(req.service, req.region, ri ? "monthly" : req.billing);
    // an ECS flavor is sold as .linux or .byol (paid Windows .win is not supported on ECS; Windows is always BYOL)
    // a spec that names its own OS (.linux or .byol) wins over the image
    if (req.service === "ecs" && /\.win$/i.test(req.spec ?? "")) {
      throw invalid("Paid Windows (.win) is not supported on ECS; Windows on ECS is always BYOL.", "spec", [".linux", ".byol"]);
    }
    const named = /\.(linux|byol)$/.exec(req.spec ?? "")?.[0];
    const imgLower = String(req.options.image ?? req.options.os ?? "").toLowerCase();
    const osSuffix = req.service === "ecs"
      ? (named ?? (imgLower.startsWith("windows") || imgLower.includes("byol") ? ".byol" : ".linux"))
      : null;
    const out: Candidate[] = [], seen = new Set<string>();
    for (const sku of await this.source.skus(req.service, req.region)) {
      if (sku.offPage) continue;
      if (osSuffix && sku.group === "ec2_vm" && /\.(linux|win|byol)$/.test(sku.spec) && !sku.spec.endsWith(osSuffix)) continue;
      const plan = sku.prices[ri ? "monthly" : req.billing];
      if (plan && seen.has(sku.spec)) continue;
      if (!plan || (req.group && sku.group !== req.group)) continue;
      if (plan) seen.add(sku.spec);
      const gen = /^[A-Za-z]+(\d+)/.exec(sku.spec);
      out.push(candidate(sku.spec, req.region, req.billing, String(plan.amount), parseCompute(sku.description), gen ? Number(gen[1]) : 0, sku.description));
    }
    // usage- or capacity-tier-priced (OBS pay-per-use, DSS pools): the SKUs have no flat list price, so offer each distinct spec once at price 0 (the real price is the rated one)
    if ((!out.length || (req.spec && !out.some(c => c.spec === req.spec))) && USAGE_PRICED.has(req.service.toLowerCase())) {
      const specs = new Set<string>();
      for (const sku of await this.source.skus(req.service, req.region)) {
        if (sku.offPage || !sku.spec || specs.has(sku.spec) || out.some(c => c.spec === sku.spec) || (req.spec && sku.spec !== req.spec && out.length) || (req.group && sku.group !== req.group)) continue;
        specs.add(sku.spec);
        out.push(candidate(sku.spec, req.region, req.billing, "0", {}, 0, "priced from usage when the list is rated"));
      }
    }
    // a VPN private-network card is the gateway SKU itself (V300): it sits in another group and has no list price
    if (req.spec && !out.some(c => c.spec === req.spec) && UNLISTED_PRICE.has(req.service.toLowerCase())) {
      const sku = (await this.source.skus(req.service, req.region)).find(item => item.spec === req.spec && !item.offPage);
      if (sku) out.push(candidate(sku.spec, req.region, req.billing, "0", {}, 0, "no list price; priced when the list is rated"));
    }
    return out;
  }
}

