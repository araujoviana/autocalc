/** HuaweiProvider: the core's view of today's catalog, availability and list prices. */
import { candidate, invalid, type Candidate, type Requirement } from "../core/quote/model.ts";
import type { Provider } from "../core/quote/provider.ts";

const BILLING = ["ondemand", "monthly", "yearly"];

export interface CatalogSku { group: string; spec: string; description: string; prices: Record<string, { amount: number }>; offPage?: boolean }
export interface HuaweiSource {
  skus(service: string, region: string): Promise<CatalogSku[]>;
  /** Throws SERVICE_NOT_SOLD / MODE_NOT_OFFERED when the region or billing mode cannot serve the service. */
  checkMode(service: string, region: string, billing: string): Promise<void>;
}

/** Python's _parse_compute: vCPU count and memory in GB from the catalog description. */
export function parseCompute(description: string): { vcpus?: number; memory_gb?: number } {
  const v = /vCPUs:\s*([\d.]+)/.exec(description), m = /Memory:\s*([\d.]+)\s*MB/.exec(description);
  return { ...(v ? { vcpus: Number(v[1]) } : {}), ...(m ? { memory_gb: Number(m[1]) / 1024 } : {}) };
}

export class HuaweiProvider implements Provider {
  readonly name = "huawei";
  constructor(private readonly source: HuaweiSource) {}

  async prices(req: Requirement, spec: string): Promise<Record<string, number> | null> {
    const sku = (await this.source.skus(req.service, req.region)).find(item => item.spec === spec);
    return sku ? Object.fromEntries(Object.entries(sku.prices).map(([mode, plan]) => [mode, Number(plan.amount)])) : null;
  }

  async candidates(req: Requirement): Promise<Candidate[]> {
    if (!BILLING.includes(req.billing)) throw invalid(`Billing '${req.billing}' is not supported here.`, "billing", BILLING);
    await this.source.checkMode(req.service, req.region, req.billing);
    // an ECS flavor is sold once per OS (.linux, .win, .byol); the image the quote asks for picks one
    const osSuffix = req.service === "ecs" ? (String(req.options.image ?? "").toLowerCase().startsWith("windows") ? ".win" : ".linux") : null;
    const out: Candidate[] = [];
    for (const sku of await this.source.skus(req.service, req.region)) {
      if (sku.offPage) continue;
      if (osSuffix && sku.group === "ec2_vm" && /\.(linux|win|byol)$/.test(sku.spec) && !sku.spec.endsWith(osSuffix)) continue;
      const plan = sku.prices[req.billing];
      if (!plan || (req.group && sku.group !== req.group)) continue;
      const gen = /^[A-Za-z]+(\d+)/.exec(sku.spec);
      out.push(candidate(sku.spec, req.region, req.billing, String(plan.amount), parseCompute(sku.description), gen ? Number(gen[1]) : 0, sku.description));
    }
    return out;
  }
}

