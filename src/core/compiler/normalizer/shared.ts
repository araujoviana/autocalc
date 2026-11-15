/** Shared constants, unit conversion helpers, and normalization state for compiler normalizers. */
import type { NormalizedResource } from "../horizon.ts";
import { parseBandwidth, parseCapacity, parseRequestRate, parseTraffic } from "../units.ts";

export type Dict = Record<string, any>;

export interface CardNormalizeState {
  r: NormalizedResource;
  service: string;
  rawNeeds: Dict;
  rawOpts: Dict;
  vcpus: number | undefined;
  memory_gb: number | undefined;
  engine: string;
  topology: string;
  haHint: boolean;
  billing: string;
  quantity: number;
  spec: string | undefined;
  needs: Dict | undefined;
  options: Dict;
}

export function parseTokens(raw: unknown): number | undefined {
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

export const OS_MAP: Record<string, string> = {
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
  byol: "Ubuntu 22.04 server 64bit",
  windows: "Ubuntu 22.04 server 64bit",
  "windows-byol": "Ubuntu 22.04 server 64bit",
  "windows-server": "Ubuntu 22.04 server 64bit",
  "windows-2019": "Ubuntu 22.04 server 64bit",
  "windows-2022": "Ubuntu 22.04 server 64bit",
};

export const KAFKA_SPEC_ALIASES: Record<string, string> = {
  "kafka.2u4g.cluster.small": "s6.2u4g.cluster.small",
  "kafka.2u4g.cluster": "c6.2u4g.cluster",
  "kafka.4u8g.cluster": "c6.4u8g.cluster",
  "kafka.8u16g.cluster": "c6.8u16g.cluster",
  "kafka.12u24g.cluster": "c6.12u24g.cluster",
  "kafka.16u32g.cluster": "c6.16u32g.cluster",
};

export const RABBITMQ_SPEC_ALIASES: Record<string, string> = {
  "rabbitmq.2u4g.cluster": "c6.2u4g.cluster",
  "rabbitmq.4u8g.cluster": "c6.4u8g.cluster",
  "rabbitmq.8u16g.cluster": "c6.8u16g.cluster",
  "rabbitmq.12u24g.cluster": "c6.12u24g.cluster",
  "rabbitmq.16u32g.cluster": "c6.16u32g.cluster",
  "rabbitmq.24u48g.cluster": "c6.24u48g.cluster",
  "rabbitmq.32u64g.cluster": "c6.32u64g.cluster",
  "rabbitmq.2u4g.single": "c6.2u4g.single",
  "rabbitmq.4u8g.single": "c6.4u8g.single",
  "rabbitmq.8u16g.single": "c6.8u16g.single",
  "rabbitmq.16u32g.single": "c6.16u32g.single",
  "rabbitmq.24u48g.single": "c6.24u48g.single",
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

export function normalizeDiskType(raw: unknown): string {
  const key = String(raw ?? "GPSSD").trim().toLowerCase();
  return DISK_TYPE_MAP[key] ?? String(raw ?? "GPSSD").trim().toUpperCase();
}

export function toGB(raw: unknown, field = "capacity"): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) return parseCapacity(raw, field).inGB;
  return undefined;
}

export function toMbps(raw: unknown, field = "bandwidth"): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) return parseBandwidth(raw, field).inMbps;
  return undefined;
}

export function toTrafficGB(raw: unknown, field = "traffic"): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) return parseTraffic(raw, field).inGBPerMonth;
  return undefined;
}

export function toRequestsPerMonth(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) return parseRequestRate(raw).perMonth;
  return undefined;
}

export function normalizeDisk(raw: unknown, minGb = 40): [string, number] {
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

export function sizeFromVcpu(vcpus: number): string {
  if (vcpus <= 2) return "large";
  if (vcpus <= 4) return "xlarge";
  if (vcpus <= 8) return "2xlarge";
  if (vcpus <= 16) return "4xlarge";
  if (vcpus <= 32) return "8xlarge";
  return "16xlarge";
}

export function pickNearestRedisMem(gb: number): number {
  const sizes = [1, 2, 4, 8, 16, 24, 32, 48, 64];
  return sizes.find(s => s >= gb) ?? 64;
}

export function splitIntoChunks(total: number, maxPerCard: number): number[] {
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

export function obsFactorMaxPerCard(factor: string): number {
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
