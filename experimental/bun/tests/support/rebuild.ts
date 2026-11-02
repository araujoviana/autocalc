import { CardInput } from "../../src/core/schemas.ts";
import { buildCard } from "../../src/core/services/index.ts";
import type { BuilderContext } from "../../src/core/services/common.ts";

type ObjectValue = Record<string, unknown>;
const obj = (v: unknown): ObjectValue => v && typeof v === "object" && !Array.isArray(v) ? v as ObjectValue : {};
const text = (v: unknown, fallback = "") => typeof v === "string" ? v : fallback;
const number = (v: unknown, fallback = 0) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
const step = (render: ObjectValue, key: string) => number(obj(obj(render[key]).UNSET_Stepper_0).measureValue);

/** Recover supported high-level inputs from saved product and form state. */
export function rebuildInput(card: ObjectValue) {
  const selected = obj(card.selectedProduct), render = obj(obj(card.rewriteValue).template_RENDER);
  const products = Array.isArray(selected.productAllInfos) ? selected.productAllInfos.map(obj) : [];
  const first = products[0] ?? {}, second = products[1] ?? {};
  const service = text(selected.serviceCode).toLowerCase();
  const mode = text(selected.chargeModeName).toLowerCase();
  const base: ObjectValue = { service, region: text(selected.region), billing: mode, quantity: number(first.productNum, 1), periods: number(selected.periodNum, 1), hours: number(first.usageValue, 730) || 730 };
  if (typeof selected._customTitle === "string" && selected._customTitle.trim()) base.title = selected._customTitle;
  const spec = text(first.resourceSpecCode);
  const bySpec = (name: string) => products.find(item => item.resourceSpecCode === name) ?? {};
  const byType = (name: string) => products.find(item => item.resourceType === name) ?? {};
  switch (service) {
    case "ecs": {
      const vm = byType("hws.resource.type.vm"), disks = products.filter(item => item.resourceType === "hws.resource.type.volume");
      const disk = (item: ObjectValue) => [text(item.resourceSpecCode), number(item.resourceSize)];
      const image = obj(render.calculator_ims_select), bandwidth = byType("hws.resource.type.bandwidth");
      const ri = obj(render.calculator_ecs_RIRadio);
      Object.assign(base, { flavor: text(vm.resourceSpecCode), quantity: number(vm.productNum, 1), image: text(image.name, text(image.__platform, "AlmaLinux")), system_disk: disk(disks[0] ?? {}), data_disks: disks.slice(1).map(disk), ri_time: text(ri.RITime, "1_3") });
      if (Object.keys(bandwidth).length) Object.assign(base, { bandwidth_type: text(bandwidth.resourceSpecCode), bandwidth_mbit: number(bandwidth.resourceSize) });
      break;
    }
    case "evs": Object.assign(base, { type: spec.replace(/\.storage$/, ""), size_gb: number(first.resourceSize, 100), ...(render.calculator_evs_iops ? { iops: step(render, "calculator_evs_iops") } : {}), ...(render.calculator_evs_throughput ? { throughput: step(render, "calculator_evs_throughput") } : {}) }); break;
    case "cce": { const parts = spec.split("."); Object.assign(base, { cluster_type: "standard", ha: parts[1] === "s2", scale: parts.at(-1) }); break; }
    case "obs": {
      const storage = ({ dataInfo_2_: "standard", dataInfo_3_: "warm", dataInfo_1_: "cold" } as Record<string, string>)[text(first.storageType)] ?? "standard";
      const pack = products.find(item => text(item.resourceSpecCode).startsWith("obs.storage."));
      Object.assign(base, { quantity: 1, storage_class: storage, multi_az: obj(render.calculator_multiAZ_radio).multiAZType === "dataInfo_5_" });
      if (pack) base.package = text(pack.resourceSpecCode).replace(/^obs\.storage\./, "");
      else base.components = products.map(item => ({ factor: text(item.usageFactor), value: number(item.usageValue), unit: item.usageMeasureId === 9 ? "TB" : "GB" }));
      break;
    }
    case "rds": Object.assign(base, { flavor: spec, storage_spec: text(second.resourceSpecCode), storage_gb: number(second.resourceSize, 40), ...(typeof first.dbVersion === "string" && first.dbVersion ? { db_version: first.dbVersion } : {}) }); break;
    case "sfsturbo": Object.assign(base, { tier: spec.replace(/^sfs\.turbo\./, ""), size_gb: number(first.resourceSize, 500) }); break;
    case "elb": Object.assign(base, { quantity: 1, public_ip_count: step(render, "calculator_ip") }); break;
    case "nat": delete base.periods; Object.assign(base, { size: spec.replace(/^natgateway_/, "") }); break;
    case "apig": Object.assign(base, { edition: spec }); break;
    case "dline": Object.assign(base, { port: spec }); break;
    case "cbr": Object.assign(base, { vault_spec: spec, size_gb: number(first.resourceSize, 100) }); break;
    case "apm": delete base.periods; Object.assign(base, { quantity: 1, spec, hours: number(first.durationNum, number(first.productNum, 730)) }); break;
    case "waf": delete base.periods; Object.assign(base, { quantity: 1, domains: number(byType("hws.resource.type.waf.payperusedomain").usageValue), rules: number(byType("hws.resource.type.waf.payperuserule").usageValue), requests: number(byType("hws.resource.type.waf.payperuserequest").usageValue), hours: number(first.productNum, 730) }); break;
    case "function": { delete base.periods; const request = products.find(item => item.usageFactor === "request") ?? {}; const compute = products.find(item => item.usageFactor === "compute") ?? {}; Object.assign(base, { requests: number(request.usageValue) * 1_000_000, gb_seconds: number(compute.usageValue), memory_mb: step(render, "calculator_fgs_memory") || 128, request_units: step(render, "calculator_fgs_request"), compute_units: Number(render.calculator_fgs_compute) || 0 }); break; }
    case "dew": { delete base.periods; const keys = number(first.resourceSize, 1), duration = number(first.usageValue) / Math.max(keys, 1); Object.assign(base, { keys, api_requests: number(second.usageValue), storage_spec: spec, api_spec: text(second.resourceSpecCode), [spec.startsWith("csms") ? "days" : "hours"]: duration }); break; }
    case "lts": { delete base.periods; const usage = (name: string) => number(bySpec(name).usageValue); Object.assign(base, { flow_gb: usage("lts.log.flow"), index_gb: usage("lts.log.index"), cold_mb: usage("lts.log.storage.cold"), storage_mb: usage("lts.log.storage"), transfer_basic_gb: usage("lts.log.transfer.basic"), transfer_senior_gb: usage("lts.log.transfer.senior"), knobs: { flow: step(render, "calculator_ltsLogFlow_stepper"), index_rate: step(render, "calculator_ltsLogIndexRate_stepper"), storage: step(render, "calculator_ltsStorage_stepper"), hot: step(render, "calculator_ltsHotStorage_stepper"), basic: step(render, "calculator_lts_transfer_basic_stepper"), senior: step(render, "calculator_lts_transfer_senior_stepper") } }); break; }
    case "eip": { const ip = products.find(item => text(item.resourceType).endsWith(".ip")); const traffic = products.find(item => item.usageFactor === "upflow"); Object.assign(base, { quantity: 1, eip_count: number(ip?.productNum, 1), traffic_gb: number(traffic?.usageValue) * (traffic?.usageMeasureId === 9 ? 1024 : 1), ip_reservation: !!ip, hours: number(ip?.usageValue, 730) }); break; }
    case "nosql": delete base.quantity; Object.assign(base, { flavor: spec.replace(/^geminidb\.cassandra-geminifs\./, ""), nodes: number(first.productNum, 2), storage_gb: number(second.resourceSize, 100), engine: "dynamodb" }); break;
    case "cci": delete base.quantity; delete base.periods; Object.assign(base, { vcpu: number(bySpec("cci.container.cpu").productNum, 1), mem_gb: number(bySpec("cci.container.mem").productNum, 2) }); break;
    case "rabbitmq":
    case "kafka": { const brokers = number(first.nodeNum, 1); Object.assign(base, { spec_id: text(first.specId), brokers, storage_gb: number(second.resourceSize, 100) / brokers }); if (service === "rabbitmq") base.version = first.versionType === "dataInfo_29_" ? "amqp" : "3.8"; break; }
    case "redis": Object.assign(base, { spec, ...(products[1] ? { bandwidth_mbit: number(second.resourceSize) } : {}) }); break;
    default: throw new Error(`No reconstruction available for ${service}`);
  }
  return CardInput.parse(base);
}
export async function rebuildCard(card: ObjectValue, context: BuilderContext) {
  return buildCard(rebuildInput(card), context);
}
