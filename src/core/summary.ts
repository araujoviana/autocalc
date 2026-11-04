/** What a saved list contains, resource by resource: sizes, vCPUs, RAM, storage (mirrors `src/autocalc/summary.py`). */

const PREFIX = "hws.resource.type.";
const MACHINES = new Set(["vm", "rds.vm"]);
const STORAGE = new Set(["volume", "rds.volume", "dms.storage", "sfsturbo"]);
const BACKUP = new Set(["cbr.vault"]);
const GB = 17;

function num(pattern: RegExp, text: string): number {
  const m = pattern.exec(text);
  return m ? Number(m[1]) : 0;
}

function vcpus(p: Record<string, any>, desc: string): number {
  return num(/vCPUs?:\s*([\d.]+)/, desc) || num(/^([\d.]+)/, String(p.cpu || ""));
}

function ramGb(p: Record<string, any>, desc: string): number {
  return num(/Memory:\s*([\d.]+)\s*MB/, desc) / 1024 || num(/^([\d.]+)/, String(p.mem || ""));
}

export function total(detail: Record<string, any>): number {
  const t = detail.totalPrice;
  return Number((t && typeof t === "object" ? t.amount : t) || 0);
}

export interface ResourceRow {
  service: string | null | undefined;
  region: string | null | undefined;
  billing: string | null | undefined;
  resource: string;
  spec: string | null | undefined;
  quantity: number;
  storage_gb: number;
  backup_gb: number;
  vcpus: number;
  ram_gb: number;
  instances: number;
  price: number;
}

export function resources(detail: Record<string, any>): ResourceRow[] {
  const rows: ResourceRow[] = [];
  for (const item of detail.cartListData || []) {
    const card = item?.selectedProduct || {};
    for (const p of card.productAllInfos || []) {
      const rawType = String(p?.resourceType || "");
      const kind = rawType.startsWith(PREFIX) ? rawType.slice(PREFIX.length) : rawType;
      if (!kind) continue;
      const qty = Number(p.productNum || 1);
      const desc = String(p.productSpecSysDesc || "");
      const gb = p.resouceSizeMeasureId === GB ? Number(p.resourceSize || 0) * qty : 0;
      const machine = MACHINES.has(kind);
      rows.push({
        service: card.serviceCode,
        region: card.region,
        billing: card.chargeModeName,
        resource: kind,
        spec: p.resourceSpecCode,
        quantity: qty,
        storage_gb: STORAGE.has(kind) ? gb : 0,
        backup_gb: BACKUP.has(kind) ? gb : 0,
        vcpus: machine ? vcpus(p, desc) * qty : 0,
        ram_gb: machine ? ramGb(p, desc) * qty : 0,
        instances: machine ? qty : 0,
        price: Number(p.inquiryResult?.amount || 0),
      });
    }
  }
  return rows;
}

export function totals(rows: ReadonlyArray<ResourceRow>) {
  const sum = (key: "instances" | "vcpus" | "ram_gb" | "storage_gb" | "backup_gb") =>
    rows.reduce((acc, r) => acc + r[key], 0);
  return {
    instances: sum("instances"),
    vcpus: sum("vcpus"),
    ram_gb: sum("ram_gb"),
    storage_gb: sum("storage_gb"),
    backup_gb: sum("backup_gb"),
  };
}
