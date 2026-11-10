/** Translates compiled `version: "1"` NormalizedResources into canonical Quote card records
 * compatible with `validate()`, `plan()`, and `publishQuoteTool()`. */
import { modesOf } from "../services/publication.ts";
import type { NormalizedResource } from "./horizon.ts";
import { parseBandwidth, parseCapacity, parseDuration, parseRequestRate, parseTraffic } from "./units.ts";

type Dict = Record<string, any>;

export const SERVICE_ALIASES: Record<string, string> = {
  dcs: "redis",
  dmq: "kafka",
  "dms-kafka": "kafka",
  "dms-rabbitmq": "rabbitmq",
  fg: "function",
  functiongraph: "function",
  "sfs-turbo": "sfsturbo",
  sfs_turbo: "sfsturbo",
  dc: "dline",
  "direct-connect": "dline",
  direct_connect: "dline",
  geminidb: "nosql",
  kms: "dew",
  csms: "dew",
  mariadb: "rdsformariadb",
  mongodb: "dds",
  secmaster: "ssa",
  flexus: "hecs",
  "flexus-x": "hecs",
  flexus_x: "hecs",
};

function parseTokens(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase().replace(/_/g, "");
    const m = s.match(/^([\d.]+)\s*(k|m|b|million|thousand|billion)?(?:\s*tokens?)?$/i);
    if (m) {
      const val = parseFloat(m[1]!);
      const unit = (m[2] ?? "").toLowerCase();
      if (unit === "k" || unit === "thousand") return val * 1_000;
      if (unit === "m" || unit === "million") return val * 1_000_000;
      if (unit === "b" || unit === "billion") return val * 1_000_000_000;
      return val;
    }
  }
  return undefined;
}

const OS_MAP: Record<string, string> = {
  ubuntu: "Ubuntu 22.04 server 64bit",
  "ubuntu-22.04": "Ubuntu 22.04 server 64bit",
  "ubuntu-24.04": "Ubuntu 24.04 server 64bit",
  "ubuntu-20.04": "Ubuntu 20.04 server 64bit",
  "ubuntu-18.04": "Ubuntu 18.04 server 64bit",
  almalinux: "AlmaLinux 9.4 64bit",
  "almalinux-9": "AlmaLinux 9.4 64bit",
  "almalinux-9.4": "AlmaLinux 9.4 64bit",
  "almalinux-9.3": "AlmaLinux 9.3 64bit",
  "almalinux-9.0": "AlmaLinux 9.0 64bit",
  "almalinux-8": "AlmaLinux 8.8 64bit",
  linux: "Ubuntu 22.04 server 64bit",
  debian: "Debian 12.0.0 64bit",
  "debian-12": "Debian 12.0.0 64bit",
  "debian-11": "Debian 11.7.0 64bit",
  rocky: "Rocky Linux 9.6 64bit",
  "rocky-9": "Rocky Linux 9.6 64bit",
  "rocky-9.6": "Rocky Linux 9.6 64bit",
  suse: "OpenSUSE 15.0 64bit",
  "suse-15": "OpenSUSE 15.0 64bit",
  opensuse: "OpenSUSE 15.0 64bit",
  "opensuse-15": "OpenSUSE 15.0 64bit",
  euleros: "EulerOS 2.9 64bit",
  "euleros-2.9": "EulerOS 2.9 64bit",
  "euleros-2.0": "EulerOS 2.0 64bit",
  openeuler: "openEuler 24.03 64bit",
  "openeuler-24.03": "openEuler 24.03 64bit",
  "openeuler-22.03": "openEuler 22.03 64bit",
  "rocky-9.5": "Rocky Linux 9.5 64bit",
  centos: "CentOS 8.2 64bit",
  "centos-8": "CentOS 8.2 64bit",
  "centos-7": "CentOS 7.9 64bit",
};

const DISK_TYPE_MAP: Record<string, string> = {
  "high-io": "SAS",
  high_io: "SAS",
  sas: "SAS",
  "ultra-high-io": "SSD",
  ultra_high_io: "SSD",
  "ultrahigh-io": "SSD",
  ssd: "SSD",
  "common-io": "SATA",
  common_io: "SATA",
  sata: "SATA",
  "general-ssd": "GPSSD",
  "general-purpose-ssd": "GPSSD",
  gpssd: "GPSSD",
  "extreme-ssd": "ESSD",
  essd: "ESSD",
  gpssd2: "GPSSD2",
  essd2: "ESSD2",
};

function normalizeDiskType(raw: unknown): string {
  const key = String(raw ?? "GPSSD").trim().toLowerCase();
  return DISK_TYPE_MAP[key] ?? String(raw ?? "GPSSD").trim().toUpperCase();
}

function toGB(raw: unknown, field = "capacity"): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) return parseCapacity(raw, field).inGB;
  return undefined;
}

function toMbps(raw: unknown, field = "bandwidth"): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) return parseBandwidth(raw, field).inMbps;
  return undefined;
}

function toTrafficGB(raw: unknown, field = "traffic"): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) return parseTraffic(raw, field).inGBPerMonth;
  return undefined;
}

function toRequestsPerMonth(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) return parseRequestRate(raw).perMonth;
  return undefined;
}

function normalizeDisk(raw: unknown, minGb = 40): [string, number] {
  if (Array.isArray(raw) && raw.length >= 2) {
    const type = normalizeDiskType(raw[0]);
    const gb = Math.max(minGb, Math.round(toGB(raw[1], "disk.size") ?? minGb));
    return [type, gb];
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Dict;
    const type = normalizeDiskType(obj.type ?? obj.disk_type ?? "GPSSD");
    const gb = Math.max(minGb, Math.round(toGB(obj.size ?? obj.size_gb ?? obj.capacity, "disk.size") ?? minGb));
    return [type, gb];
  }
  return ["GPSSD", minGb];
}

function sizeFromVcpu(vcpus: number): string {
  if (vcpus <= 2) return "large";
  if (vcpus <= 4) return "xlarge";
  if (vcpus <= 8) return "2xlarge";
  if (vcpus <= 16) return "4xlarge";
  if (vcpus <= 32) return "8xlarge";
  return "16xlarge";
}

function pickNearestRedisMem(gb: number): number {
  const sizes = [1, 2, 4, 8, 16, 24, 32, 48, 64];
  return sizes.find(s => s >= gb) ?? 64;
}

function splitIntoChunks(total: number, maxPerCard: number): number[] {
  if (total <= 0) return [];
  const chunks: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const take = Math.min(remaining, maxPerCard);
    chunks.push(take);
    remaining -= take;
  }
  return chunks;
}

function obsFactorMaxPerCard(factor: string): number {
  if (factor === "download_crr") return 9_999_999;
  if (
    factor.startsWith("size") ||
    factor.startsWith("download") ||
    factor.startsWith("retrieval_size") ||
    factor.startsWith("restore_size")
  ) {
    return 102_400;
  }
  return 9_999;
}

export function normalizeServiceAlias(service: string): string {
  const clean = service.trim().toLowerCase();
  return SERVICE_ALIASES[clean] ?? clean;
}

/** Expands a single NormalizedResource into 1 or more physical quote cards when
 * variable metrics (DEW keys/API calls, OBS capacity/requests/traffic) exceed per-card UI stepper limits.
 * Tiered OBS traffic lines are greedy max-packed (never evenly split across cards) to preserve tier brackets. */
export function normalizeResourceToCards(r: NormalizedResource, docBillingPolicy?: string): Dict[] {
  const baseCard = normalizeResourceToCard(r, docBillingPolicy);
  const service = String(baseCard.service);
  const rawOpts: Dict = { ...(r.options ?? {}) };
  const rawNeeds: Dict = { ...(r.needs ?? {}) };

  if (service === "dew") {
    const rawQty = r.quantity ?? 1;
    const totalKeys = Math.max(1, Math.round(Number(rawOpts.keys ?? rawOpts.custom_keys ?? (rawQty > 1 ? rawQty : 1))));
    const rawApi = rawOpts.api_requests ?? rawOpts.kms_api_requests ?? rawOpts.requests;
    let totalApiUnits = 10;
    if (typeof rawApi === "number" && Number.isFinite(rawApi)) {
      totalApiUnits = Math.max(1, Math.round(rawApi));
    } else if (typeof rawApi === "string" && rawApi.trim()) {
      const parsed = parseRequestRate(rawApi, `${r.id}.api_requests`);
      totalApiUnits = parsed.perMonth >= 10000 ? Math.max(1, Math.round(parsed.perMonth / 10000)) : Math.max(1, Math.round(parsed.perMonth));
    }

    const keyChunks = splitIntoChunks(totalKeys, 99);
    const apiChunks = splitIntoChunks(totalApiUnits, 9999);
    const cardCount = Math.max(keyChunks.length, apiChunks.length, 1);
    if (cardCount === 1) return [baseCard];

    return Array.from({ length: cardCount }, (_, idx) => ({
      ...baseCard,
      id: `${r.id}-${idx + 1}`,
      options: {
        ...baseCard.options,
        keys: keyChunks[idx] ?? 0,
        api_requests: apiChunks[idx] ?? 0,
      },
    }));
  }

  if (service === "obs" && !rawOpts.package) {
    const storageClass: "standard" | "warm" | "cold" = baseCard.options.storage_class ?? "standard";
    const multiAz = Boolean(baseCard.options.multi_az);
    const sizeFactor = { standard: multiAz ? "size_3az" : "size", warm: multiAz ? "size_warm_3az" : "size_warm", cold: "size_cold" }[storageClass];

    const rawComps: Dict[] = [];
    if (Array.isArray(rawOpts.components)) {
      rawComps.push(...rawOpts.components);
    } else {
      const capGb = toGB(rawOpts.capacity ?? rawOpts.size ?? rawOpts.storage ?? rawOpts.size_gb ?? rawNeeds.capacity ?? rawNeeds.storage, `${r.id}.capacity`);
      if (capGb !== undefined && capGb > 0) {
        if (capGb > 102400) {
          rawComps.push({ factor: sizeFactor, value: Math.max(1, Math.round(capGb / 1024)), unit: "TB" });
        } else {
          rawComps.push({ factor: sizeFactor, value: Math.max(1, Math.round(capGb)), unit: "GB" });
        }
      } else {
        rawComps.push({ factor: sizeFactor, value: 100, unit: "GB" });
      }

      const trafficGb = toTrafficGB(rawOpts.traffic ?? rawOpts.outbound ?? rawOpts.egress ?? rawOpts.read_traffic ?? rawOpts.egress_traffic ?? rawOpts.traffic_gb, `${r.id}.traffic`);
      if (trafficGb !== undefined && trafficGb > 0) {
        const dlFactor = { standard: "download.external", warm: "download_warm.external", cold: "download_cold.external" }[storageClass];
        rawComps.push({ factor: dlFactor, value: Math.max(1, Math.round(trafficGb)) });
      }

      const cdnGb = toTrafficGB(rawOpts.cdn_traffic ?? rawOpts.download_cdn, `${r.id}.cdn_traffic`);
      if (cdnGb !== undefined && cdnGb > 0) {
        rawComps.push({ factor: "download.cdn", value: Math.max(1, Math.round(cdnGb)) });
      }

      const getReqs = toRequestsPerMonth(rawOpts.requests_get ?? rawOpts.get_requests ?? rawOpts.read_requests ?? rawOpts.get);
      if (getReqs !== undefined && getReqs > 0) {
        const getFactor = { standard: "get", warm: "get_warm", cold: "get_cold" }[storageClass];
        const unitDiv = storageClass === "standard" ? 10000 : 1000;
        const units = getReqs >= unitDiv ? Math.round(getReqs / unitDiv) : Math.round(getReqs);
        rawComps.push({ factor: getFactor, value: Math.max(1, units) });
      }

      const putReqs = toRequestsPerMonth(rawOpts.requests_put ?? rawOpts.put_requests ?? rawOpts.write_requests ?? rawOpts.put);
      if (putReqs !== undefined && putReqs > 0) {
        const putFactor = { standard: "put", warm: "put_warm", cold: "put_cold" }[storageClass];
        const unitDiv = storageClass === "standard" ? 10000 : 1000;
        const units = putReqs >= unitDiv ? Math.round(putReqs / unitDiv) : Math.round(putReqs);
        rawComps.push({ factor: putFactor, value: Math.max(1, units) });
      }
    }

    const chunkedByComp = rawComps.map(comp => {
      const maxVal = obsFactorMaxPerCard(String(comp.factor));
      const chunks = splitIntoChunks(Number(comp.value ?? 0), maxVal);
      return (chunks.length ? chunks : [0]).map(val => ({
        factor: comp.factor,
        value: val,
        ...(comp.unit ? { unit: comp.unit } : {}),
      }));
    });

    const cardCount = Math.max(1, ...chunkedByComp.map(c => c.length));
    if (cardCount === 1) return [baseCard];

    return Array.from({ length: cardCount }, (_, idx) => {
      const compsForCard = chunkedByComp
        .map(chunks => chunks[idx])
        .filter((c): c is NonNullable<typeof c> => c !== undefined && c.value > 0);
      return {
        ...baseCard,
        id: `${r.id}-${idx + 1}`,
        options: {
          ...baseCard.options,
          components: compsForCard,
        },
      };
    });
  }

  return [baseCard];
}

export function normalizeResourceToCard(r: NormalizedResource, docBillingPolicy?: string): Dict {
  const service = normalizeServiceAlias(r.service);
  const rawNeeds: Dict = { ...(r.needs ?? {}) };
  const rawOpts: Dict = { ...(r.options ?? {}) };

  let billing = r.billing.toLowerCase();
  if (billing === "pay-per-use") billing = "ondemand";
  if (docBillingPolicy === "recommend-annual" && r.horizon.duration === "1y" && billing === "monthly") {
    const modes = modesOf(service);
    if (modes.includes("yearly") && !(service === "obs" && !rawOpts.package)) {
      billing = "yearly";
    }
  }
  if (service === "obs" && !rawOpts.package) {
    billing = "ondemand";
  } else {
    const modes = modesOf(service);
    if (modes.length > 0 && !modes.includes(billing)) {
      billing = modes[0]!;
    }
  }

  const rawVcpus = rawNeeds.vcpus ?? rawNeeds.vcpu ?? rawNeeds.cores ?? rawNeeds.cpu;
  const vcpus = typeof rawVcpus === "number" && Number.isFinite(rawVcpus) ? rawVcpus : undefined;
  const memory_gb = toGB(rawNeeds.memory_gb ?? rawNeeds.memory ?? rawNeeds.ram, `${r.id}.memory`);

  const engine = String(rawNeeds.engine ?? rawOpts.engine ?? "").toLowerCase();
  const topology = String(rawNeeds.topology ?? rawOpts.topology ?? "").toLowerCase();
  const haHint = r.availability === "multi-az" || topology.includes("ha") || topology.includes("standby") || topology.includes("cluster") || topology.includes("multi");

  let quantity = r.quantity ?? 1;
  let spec: string | undefined = r.spec;
  let needs: Dict | undefined;
  const options: Dict = {};

  if (vcpus !== undefined || memory_gb !== undefined) {
    needs = {
      ...(vcpus !== undefined ? { vcpus } : {}),
      ...(memory_gb !== undefined ? { memory_gb } : {}),
    };
  }

  switch (service) {
    case "ecs": {
      const osRaw = String(rawOpts.os ?? rawOpts.image ?? "ubuntu-22.04").trim();
      options.image = OS_MAP[osRaw.toLowerCase()] ?? (osRaw === "AlmaLinux" ? "AlmaLinux 9.4 64bit" : osRaw);
      if (rawOpts.system_disk !== undefined) {
        options.system_disk = normalizeDisk(rawOpts.system_disk, 40);
      }
      if (Array.isArray(rawOpts.data_disks)) {
        options.data_disks = rawOpts.data_disks.map((d: unknown) => normalizeDisk(d, 10));
      }
      const bw = toMbps(rawOpts.bandwidth_mbit ?? rawOpts.bandwidth, `${r.id}.bandwidth`);
      if (bw !== undefined && bw > 0) options.bandwidth_mbit = Math.round(bw);
      if (rawOpts.bandwidth_type !== undefined) options.bandwidth_type = rawOpts.bandwidth_type;
      if (rawOpts.ri_time !== undefined) options.ri_time = rawOpts.ri_time;
      if (spec && rawOpts.flavor === undefined) {
        // spec already set
      } else if (rawOpts.flavor !== undefined) {
        spec = String(rawOpts.flavor);
      }
      if (!spec && (!needs || Object.keys(needs).length === 0)) {
        needs = { vcpus: 2, memory_gb: 4 };
      } else if (!spec && needs && needs.vcpus !== undefined && needs.memory_gb === undefined) {
        needs.memory_gb = needs.vcpus * 2;
      } else if (!spec && needs && needs.memory_gb !== undefined && needs.vcpus === undefined) {
        needs.vcpus = Math.max(1, Math.round(needs.memory_gb / 2));
      }
      break;
    }

    case "evs": {
      const diskType = normalizeDiskType(spec ?? rawOpts.volume_type ?? rawOpts.type ?? rawOpts.disk_type ?? rawNeeds.type ?? "GPSSD");
      spec = ["GPSSD2", "ESSD2"].includes(diskType) ? `${diskType}.storage` : diskType;
      const sizeGb = toGB(rawOpts.size_gb ?? rawOpts.size ?? rawOpts.capacity ?? rawOpts.storage ?? rawNeeds.capacity ?? rawNeeds.size ?? rawNeeds.storage, `${r.id}.size`);
      if (sizeGb !== undefined) options.size_gb = Math.max(10, Math.round(sizeGb));
      if (billing === "ondemand" && ["GPSSD2", "ESSD2"].includes(diskType)) {
        if (rawOpts.iops !== undefined) options.iops = Number(rawOpts.iops);
        if (rawOpts.throughput !== undefined && diskType === "GPSSD2") options.throughput = Number(rawOpts.throughput);
      }
      needs = undefined;
      break;
    }

    case "cce": {
      const haRaw = rawOpts.control_plane_ha ?? rawOpts.ha ?? rawOpts.master_az;
      let ha = haRaw !== undefined
        ? (typeof haRaw === "string" ? haRaw.toLowerCase().includes("3") || haRaw.toLowerCase().includes("ha") : Boolean(haRaw))
        : haHint;
      let scaleRaw = String(rawOpts.scale ?? rawOpts.max_nodes ?? rawOpts.node_scale ?? rawNeeds.scale ?? "small").toLowerCase().replace(/nodes?$/, "");
      let scale = "small";
      if (["2000", "xlarge", "xl"].includes(scaleRaw)) scale = "xlarge";
      else if (["1000", "large", "l"].includes(scaleRaw)) scale = "large";
      else if (["200", "medium", "m", "mid"].includes(scaleRaw)) scale = "medium";
      else scale = "small";

      const clusterType = String(rawOpts.cluster_type ?? (spec?.startsWith("cce.t") ? "turbo" : "standard")).toLowerCase();
      const isTurbo = clusterType === "turbo" || (spec ? /^cce\.t[12]\./.test(spec) : false);

      if (isTurbo) {
        if (spec && /^cce\.t[12]\.(small|medium|large)$/.test(spec)) {
          const parts = spec.split(".");
          ha = parts[1] === "t2";
          scale = parts[2]!;
        } else {
          spec = `cce.${ha ? "t2" : "t1"}.${scale}`;
        }
        options.cluster_type = "turbo";
      } else {
        if (spec && /^cce\.s[12]\.(small|medium|large|xlarge)$/.test(spec)) {
          const parts = spec.split(".");
          ha = parts[1] === "s2";
          scale = parts[2]!;
        } else {
          spec = `cce.${ha ? "s2" : "s1"}.${scale}`;
        }
        options.cluster_type = "standard";
      }
      options.ha = ha;
      options.scale = scale;
      if (billing === "ondemand") quantity = 1;
      needs = undefined;
      break;
    }

    case "cci": {
      const cpuCount = Math.max(1, Math.round(Number(rawOpts.vcpu ?? rawOpts.vcpus ?? vcpus ?? 1)));
      const memCount = Math.max(1, Math.round(toGB(rawOpts.mem_gb ?? rawOpts.memory_gb ?? rawOpts.memory ?? memory_gb ?? 2, `${r.id}.memory`) ?? 2));
      options.vcpu = cpuCount;
      options.mem_gb = memCount;
      spec = spec ?? "cci.container.cpu";
      quantity = 1;
      billing = "ondemand";
      needs = undefined;
      break;
    }

    case "obs": {
      quantity = 1;
      const scRaw = String(rawOpts.storage_class ?? rawOpts.tier ?? rawNeeds.storage_class ?? "standard").toLowerCase();
      const storageClass: "standard" | "warm" | "cold" =
        scRaw === "warm" || scRaw === "ia" || scRaw === "infrequent" ? "warm" :
        scRaw === "cold" || scRaw === "archive" ? "cold" : "standard";
      const multiAz = storageClass === "cold" && !rawOpts.package ? false : Boolean(rawOpts.multi_az ?? (rawOpts.redundancy === "multi-az" || rawOpts.redundancy === "3az") ?? (r.availability === "multi-az"));

      if (rawOpts.package) {
        const pkg = String(rawOpts.package).toLowerCase().replace(/\s+/g, "");
        options.storage_class = "standard";
        options.multi_az = multiAz;
        options.package = pkg;
        if (rawOpts.traffic_package) options.traffic_package = String(rawOpts.traffic_package).toLowerCase().replace(/\s+/g, "");
        spec = `${multiAz ? "obs.storage_3az" : "obs.storage"}.${pkg}`;
      } else {
        billing = "ondemand";
        spec = "obs.001";
        options.storage_class = storageClass;
        options.multi_az = multiAz;
        if (rawOpts.months !== undefined) options.months = Math.min(12, Math.max(1, Math.round(Number(rawOpts.months))));

        if (Array.isArray(rawOpts.components)) {
          options.components = rawOpts.components;
        } else {
          const comps: Dict[] = [];
          const sizeFactor = { standard: multiAz ? "size_3az" : "size", warm: multiAz ? "size_warm_3az" : "size_warm", cold: "size_cold" }[storageClass];
          const capGb = toGB(rawOpts.capacity ?? rawOpts.size ?? rawOpts.storage ?? rawOpts.size_gb ?? rawNeeds.capacity ?? rawNeeds.storage, `${r.id}.capacity`);
          if (capGb !== undefined && capGb > 0) {
            if (capGb > 102400) {
              comps.push({ factor: sizeFactor, value: Math.min(102400, Math.max(1, Math.round(capGb / 1024))), unit: "TB" });
            } else {
              comps.push({ factor: sizeFactor, value: Math.max(1, Math.round(capGb)), unit: "GB" });
            }
          } else {
            comps.push({ factor: sizeFactor, value: 100, unit: "GB" });
          }

          const trafficGb = toTrafficGB(rawOpts.traffic ?? rawOpts.outbound ?? rawOpts.egress ?? rawOpts.read_traffic ?? rawOpts.traffic_gb, `${r.id}.traffic`);
          if (trafficGb !== undefined && trafficGb > 0) {
            const dlFactor = { standard: "download.external", warm: "download_warm.external", cold: "download_cold.external" }[storageClass];
            comps.push({ factor: dlFactor, value: Math.min(102400, Math.max(1, Math.round(trafficGb))) });
          }

          const cdnGb = toTrafficGB(rawOpts.cdn_traffic ?? rawOpts.download_cdn, `${r.id}.cdn_traffic`);
          if (cdnGb !== undefined && cdnGb > 0) {
            comps.push({ factor: "download.cdn", value: Math.min(102400, Math.max(1, Math.round(cdnGb))) });
          }

          const getReqs = toRequestsPerMonth(rawOpts.requests_get ?? rawOpts.get_requests ?? rawOpts.read_requests ?? rawOpts.get);
          if (getReqs !== undefined && getReqs > 0) {
            const getFactor = { standard: "get", warm: "get_warm", cold: "get_cold" }[storageClass];
            const unitDiv = storageClass === "standard" ? 10000 : 1000;
            const units = getReqs >= unitDiv ? Math.round(getReqs / unitDiv) : Math.round(getReqs);
            comps.push({ factor: getFactor, value: Math.min(9999, Math.max(1, units)) });
          }

          const putReqs = toRequestsPerMonth(rawOpts.requests_put ?? rawOpts.put_requests ?? rawOpts.write_requests ?? rawOpts.put);
          if (putReqs !== undefined && putReqs > 0) {
            const putFactor = { standard: "put", warm: "put_warm", cold: "put_cold" }[storageClass];
            const unitDiv = storageClass === "standard" ? 10000 : 1000;
            const units = putReqs >= unitDiv ? Math.round(putReqs / unitDiv) : Math.round(putReqs);
            comps.push({ factor: putFactor, value: Math.min(9999, Math.max(1, units)) });
          }

          options.components = comps;
        }
      }
      needs = undefined;
      break;
    }

    case "rds": {
      const stGb = toGB(rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) options.storage_gb = Math.max(40, Math.round(stGb));
      if (rawOpts.storage_spec !== undefined) {
        options.storage_spec = rawOpts.storage_spec;
      } else if (typeof rawOpts.storage_type === "string" && rawOpts.storage_type.startsWith("rds.")) {
        options.storage_spec = rawOpts.storage_type;
      }
      if (rawOpts.db_version !== undefined || rawOpts.version !== undefined || rawNeeds.version !== undefined) {
        options.db_version = String(rawOpts.db_version ?? rawOpts.version ?? rawNeeds.version);
      }
      if (!spec && rawOpts.flavor !== undefined) spec = String(rawOpts.flavor);
      if (!spec) {
        const eng = engine.includes("pg") || engine.includes("postgres") ? "pg" : "mysql";
        const v = vcpus ?? 2;
        const m = memory_gb ?? v * 4;
        const sz = sizeFromVcpu(v);
        const rawRatio = Math.round(m / v);
        const ratio = rawRatio >= 6 ? 8 : rawRatio >= 3 ? 4 : 2;
        const cls = ratio === 8 || v >= 32 ? "x1" : "n1";
        const isHa = haHint || String(rawOpts.topology ?? rawOpts.type ?? "").toLowerCase().includes("standby") || String(rawOpts.topology ?? rawOpts.type ?? "").toLowerCase().includes("ha");
        spec = `rds.${eng}.${cls}.${sz}.${ratio}${isHa ? ".ha" : ""}`;
      }
      needs = undefined;
      break;
    }

    case "sfsturbo": {
      const rawTier = String(spec ?? rawOpts.throughput ?? rawOpts.performance ?? rawOpts.tier ?? rawNeeds.tier ?? "20MBps").trim().replace(/\/s$/i, "ps");
      const fullSpec = rawTier.startsWith("sfs.turbo.") ? rawTier : `sfs.turbo.${rawTier}`;
      spec = fullSpec;
      const minTb = fullSpec === "sfs.turbo.20MBps" ? 3.6 : 1.2;
      const capGb = toGB(rawOpts.capacity ?? rawOpts.size_gb ?? rawOpts.size ?? rawOpts.storage ?? rawNeeds.capacity ?? rawNeeds.size ?? rawNeeds.storage, `${r.id}.size`);
      const targetTb = capGb !== undefined ? Math.max(minTb, Math.ceil((capGb / 1024) * 10 - 1e-9) / 10) : minTb;
      options.size_gb = Number((targetTb * 1024).toFixed(1));
      if (billing === "ondemand") quantity = 1;
      needs = undefined;
      break;
    }

    case "elb": {
      quantity = 1;
      spec = spec ?? "elbv2.basic.default";
      if (rawOpts.public_ip_count !== undefined) {
        options.public_ip_count = Math.min(2, Math.max(1, Math.round(Number(rawOpts.public_ip_count))));
      } else if (rawOpts.network_type !== undefined || rawOpts.type !== undefined || rawOpts.public !== undefined || rawOpts.internet_facing !== undefined) {
        const net = String(rawOpts.network_type ?? rawOpts.type ?? "").toLowerCase();
        const isPub = rawOpts.public === true || rawOpts.internet_facing === true || net.includes("public") || net.includes("internet") || net.includes("external");
        options.public_ip_count = isPub ? 1 : 2;
      }
      needs = undefined;
      break;
    }

    case "nat": {
      quantity = 1;
      let natSize = String(spec ?? rawOpts.size ?? rawOpts.tier ?? rawNeeds.size ?? "small").toLowerCase().replace(/^natgateway_/, "");
      if (["medium", "mid", "middle", "m"].includes(natSize)) natSize = "middle";
      else if (["large", "l"].includes(natSize)) natSize = "large";
      else if (["xlarge", "xl", "extra-large"].includes(natSize)) natSize = "xlarge";
      else natSize = "small";
      spec = `natgateway_${natSize}`;
      needs = undefined;
      break;
    }

    case "cbr": {
      quantity = 1;
      const vRaw = String(spec ?? rawOpts.vault_type ?? rawOpts.type ?? rawOpts.protects ?? rawOpts.vault_spec ?? rawNeeds.type ?? "server").toLowerCase();
      if (vRaw.startsWith("vault.")) {
        spec = vRaw;
      } else {
        const isMultiAz = rawOpts.redundancy === "multi-az" || rawOpts.multi_az === true || haHint;
        const suffix = isMultiAz ? "multiaz" : "normal";
        const kind = vRaw.includes("db") || vRaw.includes("database") ? "database" :
          vRaw.includes("turbo") || vRaw.includes("file") || vRaw.includes("sfs") ? "turbo" :
          vRaw.includes("vol") || vRaw.includes("disk") ? "volume" : "server";
        spec = kind === "volume" ? "vault.backup.volume.normal" : `vault.backup.${kind}.${suffix}`;
      }
      const capGb = toGB(rawOpts.capacity ?? rawOpts.size_gb ?? rawOpts.capacity_gb ?? rawOpts.size ?? rawOpts.storage ?? rawNeeds.capacity ?? rawNeeds.size ?? rawNeeds.storage, `${r.id}.size`);
      if (capGb !== undefined) options.size_gb = Math.max(10, Math.round(capGb));
      needs = undefined;
      break;
    }

    case "apig": {
      quantity = 1;
      billing = "ondemand";
      const edRaw = String(spec ?? rawOpts.edition ?? rawNeeds.edition ?? "BASIC").toUpperCase();
      const ed = edRaw === "PRO" ? "PROFESSIONAL" : edRaw;
      spec = ["BASIC", "PROFESSIONAL", "ENTERPRISE", "PLATINUM"].includes(ed) ? ed : "BASIC";
      needs = undefined;
      break;
    }

    case "apm": {
      quantity = 1;
      billing = "ondemand";
      spec = String(spec ?? rawOpts.spec ?? "apm2.instance.normal");
      needs = undefined;
      break;
    }

    case "dline": {
      let portRaw = String(spec ?? rawOpts.port ?? rawOpts.speed ?? rawOpts.port_speed ?? rawOpts.bandwidth ?? rawNeeds.port ?? "1ge").toLowerCase().trim();
      const mbps = toMbps(rawOpts.bandwidth, `${r.id}.bandwidth`);
      if (mbps !== undefined) {
        portRaw = mbps >= 100000 ? "100ge" : mbps >= 40000 ? "40ge" : mbps >= 10000 ? "10ge" : "1ge";
      } else if (portRaw.includes("100")) {
        portRaw = "100ge";
      } else if (portRaw.includes("40")) {
        portRaw = "40ge";
      } else if (portRaw.includes("10")) {
        portRaw = "10ge";
      } else {
        portRaw = "1ge";
      }
      spec = portRaw;
      needs = undefined;
      break;
    }

    case "waf": {
      quantity = 1;
      billing = "ondemand";
      spec = spec ?? "waf.payperuse.rule";
      const doms = rawOpts.domains ?? rawOpts.domain_count ?? rawOpts.domain_expansion;
      const rls = rawOpts.rules ?? rawOpts.rule_count ?? rawOpts.rule_expansion;
      if (doms !== undefined) options.domains = Math.max(1, Math.round(Number(doms)));
      if (rls !== undefined) options.rules = Math.max(1, Math.round(Number(rls)));
      const reqs = toRequestsPerMonth(rawOpts.requests ?? rawOpts.monthly_requests);
      if (reqs !== undefined) options.requests = Math.max(1000000, Math.round(reqs));
      needs = undefined;
      break;
    }

    case "dew": {
      const mode = String(rawOpts.type ?? rawOpts.service_type ?? (spec?.startsWith("csms") ? "csms" : "kms")).toLowerCase();
      const isCsms = mode.includes("csms") || mode.includes("secret") || rawOpts.secrets !== undefined;
      const storageSpec = String(rawOpts.storage_spec ?? (isCsms ? "csms.secret.storage" : "kms.ud.customer"));
      const apiSpec = String(rawOpts.api_spec ?? (isCsms ? "csms.secret.api" : "kms.api"));
      const keys = Math.min(99, Math.max(1, Math.round(Number(rawOpts.secrets ?? rawOpts.keys ?? rawOpts.custom_keys ?? (quantity > 1 ? quantity : 1)))));
      let apiReqs = toRequestsPerMonth(rawOpts.requests ?? rawOpts.api_requests ?? rawOpts.kms_api_requests) ?? 10;
      if (apiReqs > 9999) apiReqs = Math.min(9999, Math.max(1, Math.round(apiReqs / 10000)));
      options.keys = keys;
      options.api_requests = Math.max(1, Math.round(apiReqs));
      options.storage_spec = storageSpec;
      options.api_spec = apiSpec;
      if (rawOpts.days !== undefined) options.days = Math.max(1, Math.round(Number(rawOpts.days)));
      spec = storageSpec;
      quantity = 1;
      billing = "ondemand";
      needs = undefined;
      break;
    }

    case "kafka": {
      const validSpecs = new Set(["kafka.2u4g.single.small", "kafka.2u4g.single", "s6.2u4g.cluster.small", "c6.2u4g.cluster", "c6.4u8g.cluster", "c6.8u16g.cluster", "c6.12u24g.cluster", "c6.16u32g.cluster"]);
      let specId = String(rawOpts.flavor ?? rawOpts.spec ?? rawOpts.spec_id ?? (spec && validSpecs.has(spec) ? spec : "")).trim();
      if (!validSpecs.has(specId)) {
        const v = vcpus ?? (haHint || Number(rawOpts.brokers ?? 1) >= 3 ? 2 : 2);
        if (haHint || Number(rawOpts.brokers ?? 1) >= 3) {
          specId = v >= 16 ? "c6.16u32g.cluster" : v >= 12 ? "c6.12u24g.cluster" : v >= 8 ? "c6.8u16g.cluster" : v >= 4 ? "c6.4u8g.cluster" : "c6.2u4g.cluster";
        } else {
          specId = "kafka.2u4g.single.small";
        }
      }
      options.spec_id = specId;
      options.brokers = specId.includes(".single") ? 1 : Math.max(3, Math.round(Number(rawOpts.brokers ?? rawOpts.broker_count ?? rawOpts.nodes ?? 3)));
      const stGb = toGB(rawOpts.storage_per_broker_gb ?? rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      options.storage_gb = stGb !== undefined ? Math.max(100, Math.round(stGb)) : 100;
      spec = "dms.platinum.c6.kafka";
      needs = undefined;
      break;
    }

    case "rabbitmq": {
      const validSpecs = new Set(["c6.2u4g.single", "c6.4u8g.single", "c6.8u16g.single", "c6.16u32g.single", "c6.24u48g.single", "c6.2u4g.cluster", "c6.4u8g.cluster", "c6.8u16g.cluster", "c6.12u24g.cluster", "c6.16u32g.cluster", "c6.24u48g.cluster", "c6.32u64g.cluster"]);
      let specId = String(rawOpts.flavor ?? rawOpts.spec ?? rawOpts.spec_id ?? (spec && validSpecs.has(spec) ? spec : "")).trim();
      if (!validSpecs.has(specId)) {
        const v = vcpus ?? 2;
        if (haHint || Number(rawOpts.brokers ?? 1) >= 3) {
          specId = v >= 16 ? "c6.16u32g.cluster" : v >= 8 ? "c6.8u16g.cluster" : v >= 4 ? "c6.4u8g.cluster" : "c6.2u4g.cluster";
        } else {
          specId = v >= 16 ? "c6.16u32g.single" : v >= 8 ? "c6.8u16g.single" : v >= 4 ? "c6.4u8g.single" : "c6.2u4g.single";
        }
      }
      options.spec_id = specId;
      const rawBrokers = Number(rawOpts.brokers ?? rawOpts.broker_count ?? rawOpts.nodes ?? (specId.endsWith(".cluster") ? 3 : 1));
      options.brokers = specId.endsWith(".single") ? 1 : ([3, 5, 7].includes(rawBrokers) ? rawBrokers : 3);
      const stGb = toGB(rawOpts.storage_per_broker_gb ?? rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      options.storage_gb = stGb !== undefined ? Math.max(100, Math.round(stGb)) : 100;
      if (rawOpts.version !== undefined || rawOpts.engine_version !== undefined) options.version = String(rawOpts.version ?? rawOpts.engine_version);
      spec = "dms.platinum.c6.rabbitmq";
      needs = undefined;
      break;
    }

    case "nosql": {
      let flavor = String(rawOpts.flavor ?? (spec ? spec.replace(/^geminidb\.cassandra-geminifs\./, "") : "")).trim();
      if (!flavor || !flavor.endsWith(".4")) {
        flavor = `${sizeFromVcpu(vcpus ?? 2)}.4`;
      }
      options.flavor = flavor;
      options.nodes = Math.max(2, Math.round(Number(rawOpts.nodes ?? rawOpts.node_count ?? rawOpts.replicas ?? (quantity > 1 ? quantity : 3))));
      const stGb = toGB(rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      options.storage_gb = stGb !== undefined ? Math.max(100, Math.round(stGb)) : 100;
      options.engine = "dynamodb";
      spec = `geminidb.cassandra-geminifs.${flavor}`;
      quantity = 1;
      needs = undefined;
      break;
    }

    case "redis": {
      if (billing === "ondemand") billing = "monthly";
      const instances = Math.max(1, Math.round(Number(rawOpts.instances ?? rawOpts.quantity ?? (quantity > 1 ? quantity : 1))));
      if (instances > 1 || rawOpts.instances !== undefined) options.instances = instances;
      quantity = 1;
      if (!spec) {
        const mem = pickNearestRedisMem(Math.round(memory_gb ?? toGB(rawOpts.capacity_gb ?? rawOpts.memory_gb ?? rawOpts.memory ?? rawOpts.capacity ?? rawOpts.size, `${r.id}.memory`) ?? 4));
        const top = String(rawOpts.topology ?? rawOpts.instance_type ?? topology).toLowerCase();
        if (top.includes("cluster")) {
          spec = `redis.cluster.xu1.large.r2.${Math.max(4, mem)}`;
        } else if (haHint || top.includes("standby") || top.includes("ha")) {
          spec = `redis.ha.xu1.large.r2.${mem}`;
        } else {
          spec = `redis.single.xu1.large.${mem}`;
        }
      }
      needs = undefined;
      break;
    }

    case "memcached": {
      billing = "ondemand";
      spec = spec ?? (haHint ? "dcs.memcached.master_standby" : "dcs.memcached.single_node");
      const mem = toGB(rawOpts.memory_gb ?? rawOpts.capacity_gb ?? rawOpts.memory ?? rawOpts.capacity ?? rawOpts.size ?? memory_gb, `${r.id}.memory`);
      if (mem !== undefined) options.memory_gb = Math.max(2, Math.round(mem));
      needs = undefined;
      break;
    }

    case "dds": {
      const shardCount = rawOpts.shards ?? rawOpts.shard_count ?? (rawOpts.nodes !== undefined ? Number(rawOpts.nodes) : undefined);
      if (!spec) {
        spec = `dds.mongodb.c6.${sizeFromVcpu(vcpus ?? 2)}.8.${shardCount ? "shard" : "repset"}`;
      }
      if (shardCount !== undefined) options.shards = Math.min(32, Math.max(2, Math.round(Number(shardCount))));
      const stGb = toGB(rawOpts.shard_storage_gb ?? rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) options.shard_storage_gb = Math.min(5000, Math.max(10, Math.round(stGb / 10) * 10));
      needs = undefined;
      break;
    }

    case "gaussdb": {
      if (rawOpts.deployment_mode !== undefined || rawOpts.deploy_model !== undefined || rawOpts.edition !== undefined) {
        const dm = String(rawOpts.deployment_mode ?? rawOpts.deploy_model ?? rawOpts.edition).toLowerCase();
        options.deploy_model = dm.includes("dist") ? "distributed" : "centralized";
      }
      if (!spec) {
        const v = vcpus ?? 16;
        const sz = v >= 64 ? "16xlarge" : v >= 32 ? "8xlarge" : "4xlarge";
        spec = `gaussdb.bs.c6.${sz}.x864.ha`;
      }
      const stGb = toGB(rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) options.storage_gb = Math.min(24000, Math.max(40, Math.round(stGb / 4) * 4));
      needs = undefined;
      break;
    }

    case "taurusdb": {
      if (!spec) {
        spec = `gaussdb.mysql.${sizeFromVcpu(vcpus ?? 4)}.x86.4`;
      }
      const nodeCount = rawOpts.nodes ?? rawOpts.node_count ?? (rawOpts.replicas !== undefined ? Number(rawOpts.replicas) + 1 : undefined);
      if (nodeCount !== undefined) options.nodes = Math.min(10, Math.max(2, Math.round(Number(nodeCount))));
      if (rawOpts.topology !== undefined || rawOpts.enterprise_instance !== undefined) {
        options.enterprise_instance = String(rawOpts.topology ?? rawOpts.enterprise_instance).toLowerCase().includes("multi") ? "multi-master" : "standard";
      }
      const stGb = toGB(rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) options.storage_gb = Math.min(128000, Math.max(40, Math.round(stGb / 10) * 10));
      needs = undefined;
      break;
    }

    case "rdsformariadb": {
      if (!spec) {
        spec = `mariadb.x1.${sizeFromVcpu(vcpus ?? 4)}.4.ha`;
      }
      if (rawOpts.version !== undefined || rawOpts.db_version !== undefined) {
        options.db_version = String(rawOpts.version ?? rawOpts.db_version);
      }
      if (rawOpts.topology !== undefined || rawOpts.instance_type !== undefined) {
        const top = String(rawOpts.topology ?? rawOpts.instance_type).toLowerCase();
        options.instance_type = top.includes("single") ? "Single" : "Ha";
      }
      const stGb = toGB(rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) options.storage_gb = Math.min(4000, Math.max(40, Math.round(stGb / 10) * 10));
      needs = undefined;
      break;
    }

    case "hrds": {
      if (billing === "ondemand") billing = "monthly";
      if (!spec || !spec.includes(".y1.")) {
        const engRaw = String(rawOpts.engine ?? rawOpts.db_type ?? rawNeeds.engine ?? "mysql").toLowerCase();
        const eng = engRaw.includes("pg") || engRaw.includes("postgres") ? "pg" : "mysql";
        const sz = (vcpus ?? 4) >= 4 ? "xlarge.2" : (memory_gb ?? 8) >= 8 ? "large.4" : "large.2";
        const isHa = haHint || String(rawOpts.topology ?? rawOpts.instance_type ?? "").toLowerCase().includes("ha") || String(rawOpts.topology ?? rawOpts.instance_type ?? "").toLowerCase().includes("standby");
        const haSuffix = isHa ? ".ha" : "";
        spec = `rds.${eng}.y1.${sz}${haSuffix}`;
      }
      if (rawOpts.version !== undefined || rawOpts.db_version !== undefined) options.db_version = String(rawOpts.version ?? rawOpts.db_version);
      const stGb = toGB(rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) options.storage_gb = Math.max(120, Math.round(stGb / 10) * 10);
      needs = undefined;
      break;
    }

    case "ssa": {
      billing = "ondemand";
      quantity = 1;
      const edRaw = String(spec ?? rawOpts.edition ?? rawNeeds.edition ?? "professional").toLowerCase();
      spec = edRaw.includes("stand") ? "secmaster.standard" : edRaw.includes("basic") ? "secmaster.basic" : "secmaster.professional";
      needs = undefined;
      break;
    }

    case "ddm": {
      if (!spec) {
        const v = vcpus ?? 8;
        const sz = v >= 32 ? "8xlarge" : v >= 16 ? "4xlarge" : "2xlarge";
        spec = `ddm.c6.${sz}.2`;
      }
      const nodes = rawOpts.nodes ?? rawOpts.node_count;
      if (nodes !== undefined) quantity = Math.max(2, Math.round(Number(nodes)));
      needs = undefined;
      break;
    }

    case "drs": {
      if (!spec || !spec.startsWith("drs.")) {
        const flow = String(rawOpts.direction ?? rawOpts.flow ?? rawOpts.task_type ?? rawNeeds.flow ?? "").toLowerCase();
        spec = flow.includes("sync") ? "drs.xlg.sync" : "drs.med.dr";
      }
      needs = undefined;
      break;
    }

    case "sfs": {
      billing = "ondemand";
      quantity = 1;
      spec = spec ?? "SFS_SATA";
      const capGb = toGB(rawOpts.capacity ?? rawOpts.capacity_gb ?? rawOpts.storage_space_gb ?? rawOpts.size ?? rawOpts.size_gb ?? rawOpts.storage ?? rawNeeds.capacity ?? rawNeeds.storage, `${r.id}.capacity`);
      options.capacity_gb = capGb !== undefined ? Math.max(1, Math.round(capGb)) : 500;
      needs = undefined;
      break;
    }

    case "dss": {
      billing = "yearly";
      quantity = 1;
      const isSas = String(spec ?? rawOpts.storage_type ?? rawOpts.type ?? "").toUpperCase().includes("SAS");
      spec = isSas ? "DSS.SAS" : "DSS.SSD";
      const rawCap = String(rawOpts.pool_capacity ?? rawOpts.capacity ?? rawOpts.size_tb ?? rawOpts.size ?? "").trim();
      const match = rawCap.match(/^([\d.]+)/);
      if (match) {
        const num = parseFloat(match[1]!);
        options.capacity = `${num.toFixed(3)} TB`;
      } else {
        options.capacity = isSas ? "43.350 TB" : "13.600 TB";
      }
      needs = undefined;
      break;
    }

    case "sdrs": {
      billing = "ondemand";
      spec = spec ?? "sdrs_hdrs";
      const count = rawOpts.dr_pairs ?? rawOpts.protected_instances ?? rawOpts.protection_groups ?? rawOpts.instances ?? rawOpts.quantity ?? (quantity > 1 ? quantity : 1);
      options.protection_groups = Math.max(1, Math.round(Number(count)));
      quantity = 1;
      needs = undefined;
      break;
    }

    case "des": {
      billing = "ondemand";
      const mediaRaw = String(rawOpts.mode ?? rawOpts.media ?? rawOpts.transfer_type ?? "").toLowerCase();
      const isTeleport = mediaRaw.includes("teleport") || ((rawOpts.onsite_days !== undefined || rawOpts.devices !== undefined) && !mediaRaw.includes("disk"));
      spec = spec ?? (isTeleport ? "des.teleport.60TB" : "des.disk");
      const days = rawOpts.onsite_days ?? rawOpts.teleport_days ?? rawOpts.devices;
      if (days !== undefined && spec.startsWith("des.teleport")) {
        options.devices = Math.min(99, Math.max(1, Math.round(Number(days))));
      }
      if (rawOpts.count !== undefined || rawOpts.device_count !== undefined || rawOpts.disk_count !== undefined || rawOpts.quantity !== undefined) {
        quantity = Math.max(1, Math.round(Number(rawOpts.count ?? rawOpts.device_count ?? rawOpts.disk_count ?? rawOpts.quantity)));
      }
      needs = undefined;
      break;
    }

    case "er": {
      billing = "ondemand";
      spec = spec ?? "er.vpc.attachment";
      options.attachments = Math.max(1, Math.round(Number(rawOpts.attachments ?? rawOpts.connections ?? (quantity > 1 ? quantity : 2))));
      const downflow = toTrafficGB(rawOpts.traffic ?? rawOpts.traffic_gb ?? rawOpts.data_transfer_gb ?? rawOpts.downflow_gb ?? rawOpts.downflow, `${r.id}.traffic`);
      options.downflow_gb = downflow !== undefined ? Math.max(1, Math.round(downflow)) : 100;
      const hrsRaw = rawOpts.hours ?? rawOpts.attachment_hours;
      if (hrsRaw !== undefined) {
        const hrs = typeof hrsRaw === "string" ? parseDuration(hrsRaw).inHours : Number(hrsRaw);
        options.attachment_hours = Math.max(1, Math.round(hrs));
      }
      quantity = 1;
      needs = undefined;
      break;
    }

    case "vpcep": {
      billing = "ondemand";
      quantity = 1;
      spec = spec ?? "vpcep.basic";
      const hrsRaw = rawOpts.hours ?? rawOpts.duration_hours;
      if (hrsRaw !== undefined) {
        const hrs = typeof hrsRaw === "string" ? parseDuration(hrsRaw).inHours : Number(hrsRaw);
        const epCount = Number(rawOpts.endpoints ?? rawOpts.quantity ?? 1);
        options.duration_hours = Math.max(1, Math.round(hrs * epCount));
      }
      needs = undefined;
      break;
    }

    case "eip": {
      spec = spec ?? "19_bgp";
      const ipQty = Number(rawOpts.count ?? rawOpts.quantity ?? rawOpts.ip_quantity ?? rawOpts.eip_count ?? (quantity > 1 ? quantity : 1));
      if (ipQty >= 1) options.ip_quantity = Math.min(99, Math.round(ipQty));
      const bw = toMbps(rawOpts.bandwidth_mbps ?? rawOpts.bandwidth_mbit ?? rawOpts.bandwidth, `${r.id}.bandwidth`);
      if (bw !== undefined && bw > 0) options.bandwidth_mbps = Math.max(1, Math.round(bw));
      quantity = 1;
      needs = undefined;
      break;
    }

    case "vpn": {
      quantity = 1;
      spec = "19_bgp";
      const bw = toMbps(rawOpts.bandwidth ?? rawOpts.bandwidth_mbps ?? rawOpts.shared_bandwidth_mbps, `${r.id}.bandwidth`);
      const eip1 = toMbps(rawOpts.eip1_mbps ?? rawOpts.eip1_bandwidth_mbps, `${r.id}.eip1_mbps`) ?? bw;
      const eip2 = toMbps(rawOpts.eip2_mbps ?? rawOpts.eip2_bandwidth_mbps, `${r.id}.eip2_mbps`) ?? bw;
      if (eip1 !== undefined) options.eip1_mbps = Math.min(300, Math.max(1, Math.round(eip1)));
      if (eip2 !== undefined) options.eip2_mbps = Math.min(300, Math.max(1, Math.round(eip2)));
      const conns = rawOpts.connections ?? rawOpts.tunnels ?? rawOpts.connection_groups;
      if (conns !== undefined) options.connection_groups = Math.max(1, Math.round(Number(conns)));
      needs = undefined;
      break;
    }

    case "cfw": {
      quantity = 1;
      const edRaw = String(spec ?? rawOpts.edition ?? "").toLowerCase();
      const isProf = billing === "ondemand" || edRaw.includes("prof");
      spec = isProf ? "cfw.professional" : "cfw.standard";
      options.edition = isProf ? "detail_11_" : "detail_3_";
      const bw = toMbps(rawOpts.protection_bandwidth_mbps ?? rawOpts.bandwidth_mbps ?? rawOpts.bandwidth_mbit ?? rawOpts.bandwidth ?? rawOpts.bandwidth_Add, `${r.id}.bandwidth`);
      if (bw !== undefined && bw > 0) options.bandwidth_mbps = Math.max(5, Math.round(bw / 5) * 5);
      const eips = rawOpts.protected_eips ?? rawOpts.eips ?? rawOpts.eip_Add;
      if (eips !== undefined) options.eips = Math.max(1, Math.round(Number(eips)));
      needs = undefined;
      break;
    }

    case "hss": {
      const q = rawOpts.hosts ?? rawOpts.servers ?? rawOpts.quantity;
      if (q !== undefined && quantity === 1) {
        quantity = Math.max(1, Math.round(Number(q)));
      }
      const edRaw = String(spec ?? rawOpts.edition ?? rawNeeds.edition ?? "premium").toLowerCase();
      const map: Record<string, [string, string]> = {
        basic: ["hss.version.basic", "dataInfo_1_"],
        "hss.version.basic": ["hss.version.basic", "dataInfo_1_"],
        wtp: ["hss.version.wtp", "dataInfo_3_"],
        web_tamper_protection: ["hss.version.wtp", "dataInfo_3_"],
        "hss.version.wtp": ["hss.version.wtp", "dataInfo_3_"],
        premium: ["hss.version.premium", "dataInfo_4_"],
        "hss.version.premium": ["hss.version.premium", "dataInfo_4_"],
        container: ["hss.version.container.enterprise", "dataInfo_5_"],
        container_enterprise: ["hss.version.container.enterprise", "dataInfo_5_"],
        "hss.version.container.enterprise": ["hss.version.container.enterprise", "dataInfo_5_"],
        advanced: ["hss.version.advanced", "dataInfo_6_"],
        enterprise: ["hss.version.advanced", "dataInfo_6_"],
        "hss.version.advanced": ["hss.version.advanced", "dataInfo_6_"],
      };
      const [hssSpec, token] = map[edRaw] ?? ["hss.version.premium", "dataInfo_4_"];
      spec = billing === "ondemand" && (hssSpec === "hss.version.basic" || hssSpec === "hss.version.wtp") ? "hss.version.premium" : hssSpec;
      options.edition = spec === "hss.version.premium" ? "dataInfo_4_" : token;
      if (billing === "ondemand") quantity = 1;
      needs = undefined;
      break;
    }

    case "function": {
      billing = "ondemand";
      quantity = 1;
      spec = spec ?? "functionstage";
      const reqRaw = rawOpts.requests ?? rawOpts.invocations ?? rawOpts.requests_10k ?? rawOpts.requests_ten_thousands ?? rawOpts.request_units;
      if (rawOpts.requests_10k !== undefined || rawOpts.requests_ten_thousands !== undefined) {
        options.requests_10k = Math.max(1, Math.round(Number(rawOpts.requests_10k ?? rawOpts.requests_ten_thousands)));
      } else if (reqRaw !== undefined) {
        const reqs = toRequestsPerMonth(reqRaw);
        if (reqs !== undefined) {
          options.requests_10k = Math.max(1, Math.round(reqs >= 10000 ? reqs / 10000 : reqs));
        } else {
          options.requests_10k = 200;
        }
      } else {
        options.requests_10k = 200;
      }
      if (rawOpts.memory_mb !== undefined) {
        const mb = typeof rawOpts.memory_mb === "number" ? rawOpts.memory_mb : Math.round(parseCapacity(rawOpts.memory_mb, `${r.id}.memory_mb`).inGB * 1024);
        options.memory_mb = Math.min(1024, Math.max(128, Math.round(mb)));
      } else if (rawOpts.memory !== undefined || memory_gb !== undefined) {
        const memGb = toGB(rawOpts.memory ?? memory_gb, `${r.id}.memory`) ?? 0.5;
        options.memory_mb = Math.min(1024, Math.max(128, Math.round(memGb * 1024)));
      } else {
        options.memory_mb = 512;
      }
      const computeVal = rawOpts.compute ?? rawOpts.compute_units ?? rawOpts.gb_seconds ?? rawOpts.execution_seconds;
      if (computeVal !== undefined) {
        options.compute = typeof computeVal === "number" ? computeVal : Number(computeVal) || 100;
      }
      needs = undefined;
      break;
    }

    case "lts": {
      billing = "ondemand";
      quantity = 1;
      spec = spec ?? "lts.log.flow";
      const monthlyGb = toTrafficGB(rawOpts.monthly_flow ?? rawOpts.raw_log_size_gb ?? rawOpts.raw_log_size, `${r.id}.monthly_flow`);
      const flowDay = rawOpts.flow_gb_per_day !== undefined
        ? Number(rawOpts.flow_gb_per_day)
        : rawOpts.daily_flow !== undefined
          ? Number(rawOpts.daily_flow)
          : monthlyGb !== undefined
            ? Math.max(1, Math.round(monthlyGb / 30))
            : rawOpts.flow_gb !== undefined
              ? Math.max(1, Math.round(Number(rawOpts.flow_gb) / 30))
              : rawOpts.flow !== undefined || rawOpts.traffic !== undefined || rawOpts.capacity !== undefined
                ? Math.max(1, Math.round(((toTrafficGB(rawOpts.flow ?? rawOpts.traffic ?? rawOpts.capacity, `${r.id}.flow`)) ?? 30) / 30))
                : 5;
      options.flow_gb_per_day = Math.max(1, Math.round(flowDay));
      if (rawOpts.retention_days !== undefined) options.retention_days = Math.min(365, Math.max(1, Math.round(Number(rawOpts.retention_days))));
      const idxPct = rawOpts.index_percent ?? rawOpts.index_ratio;
      if (idxPct !== undefined) {
        const num = typeof idxPct === "string" ? parseFloat(idxPct.replace("%", "")) : Number(idxPct);
        options.index_percent = Math.min(100, Math.max(1, Math.round(num)));
      }
      if (rawOpts.cold_enabled !== undefined || rawOpts.cold_storage !== undefined) {
        options.cold_enabled = Boolean(rawOpts.cold_enabled ?? rawOpts.cold_storage);
      }
      if (rawOpts.hot_retention_days !== undefined) options.hot_retention_days = Math.min(365, Math.max(1, Math.round(Number(rawOpts.hot_retention_days))));
      if (rawOpts.total_retention_days !== undefined) options.total_retention_days = Math.min(365, Math.max(1, Math.round(Number(rawOpts.total_retention_days))));
      if (rawOpts.transfer_basic_gb_per_day !== undefined) options.transfer_basic_gb_per_day = Math.max(0, Number(rawOpts.transfer_basic_gb_per_day));
      if (rawOpts.transfer_senior_gb_per_day !== undefined) options.transfer_senior_gb_per_day = Math.max(0, Number(rawOpts.transfer_senior_gb_per_day));
      if (rawOpts.months !== undefined) options.months = Math.min(60, Math.max(1, Math.round(Number(rawOpts.months))));
      needs = undefined;
      break;
    }

    case "maas": {
      billing = "ondemand";
      quantity = 1;
      spec = spec ?? "modelarts.tokens.deepseek.v4.1.flash";

      const inRaw = rawOpts.input_tokens ?? rawOpts.tokens ?? rawOpts.tokens_thousands ?? rawOpts.input_mtokens;
      let inMtokens: number | undefined;
      if (rawOpts.input_mtokens !== undefined) {
        inMtokens = Number(rawOpts.input_mtokens);
      } else if (rawOpts.tokens_thousands !== undefined) {
        inMtokens = Math.max(1, Math.round(Number(rawOpts.tokens_thousands) / 1000));
      } else if (inRaw !== undefined) {
        const parsed = parseTokens(inRaw);
        if (parsed !== undefined) inMtokens = Math.max(1, Math.round(parsed / 1_000_000));
      }
      if (inMtokens !== undefined) options.input_mtokens = Math.max(1, Math.round(inMtokens));

      const outRaw = rawOpts.output_tokens ?? rawOpts.output_mtokens;
      if (rawOpts.output_mtokens !== undefined) {
        options.output_mtokens = Math.max(1, Math.round(Number(rawOpts.output_mtokens)));
      } else if (outRaw !== undefined) {
        const parsed = parseTokens(outRaw);
        if (parsed !== undefined) options.output_mtokens = Math.max(1, Math.round(parsed / 1_000_000));
      }

      const cachedRaw = rawOpts.cached_tokens ?? rawOpts.cached_input_tokens ?? rawOpts.cached_input_mtokens;
      if (rawOpts.cached_input_mtokens !== undefined) {
        options.cached_input_mtokens = Math.max(1, Math.round(Number(rawOpts.cached_input_mtokens)));
      } else if (cachedRaw !== undefined) {
        const parsed = parseTokens(cachedRaw);
        if (parsed !== undefined) options.cached_input_mtokens = Math.max(1, Math.round(parsed / 1_000_000));
      }

      needs = undefined;
      break;
    }

    case "hecs": {
      const osRaw = String(rawOpts.os ?? rawOpts.image ?? "ubuntu-22.04").trim();
      options.image = OS_MAP[osRaw.toLowerCase()] ?? osRaw;
      if (rawOpts.system_disk !== undefined) {
        options.system_disk = normalizeDisk(rawOpts.system_disk, 40);
      }
      const bw = toMbps(rawOpts.bandwidth_mbit ?? rawOpts.bandwidth, `${r.id}.bandwidth`);
      if (bw !== undefined && bw > 0) options.bandwidth_mbit = Math.round(bw);
      if (!spec && (!needs || Object.keys(needs).length === 0)) {
        needs = { vcpus: 2, memory_gb: 4 };
      }
      break;
    }

    default: {
      Object.assign(options, rawOpts);
      break;
    }
  }

  return {
    id: r.id,
    service,
    region: service === "maas" ? "ap-southeast-1" : r.region,
    billing,
    quantity,
    ...(needs && Object.keys(needs).length > 0 ? { needs } : {}),
    ...(spec ? { spec } : {}),
    options,
  };
}
