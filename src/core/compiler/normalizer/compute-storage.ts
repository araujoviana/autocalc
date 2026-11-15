/** Compute, container, and storage card normalization rules. */
import { CalculatorError } from "../../errors.ts";
import {
  type CardNormalizeState,
  type Dict,
  normalizeDisk,
  normalizeDiskType,
  OS_MAP,
  toGB,
  toMbps,
  toRequestsPerMonth,
  toTrafficGB,
} from "./shared.ts";

/** Normalizes compute, container, and storage services into `state`; returns false if unhandled. */
export function normalizeComputeStorageService(state: CardNormalizeState): boolean {
  const { r, service, rawNeeds, rawOpts, vcpus, memory_gb, haHint, options } = state;

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
      if (state.spec && rawOpts.flavor === undefined) {
        // spec already set
      } else if (rawOpts.flavor !== undefined) {
        state.spec = String(rawOpts.flavor);
      }
      if (!state.spec && (!state.needs || Object.keys(state.needs).length === 0)) {
        state.needs = { vcpus: 2, memory_gb: 4 };
      } else if (!state.spec && state.needs && state.needs.vcpus !== undefined && state.needs.memory_gb === undefined) {
        state.needs.memory_gb = state.needs.vcpus * 2;
      } else if (!state.spec && state.needs && state.needs.memory_gb !== undefined && state.needs.vcpus === undefined) {
        state.needs.vcpus = Math.max(1, Math.round(state.needs.memory_gb / 2));
      }
      return true;
    }

    case "evs": {
      const diskType = normalizeDiskType(state.spec ?? rawOpts.volume_type ?? rawOpts.type ?? rawOpts.disk_type ?? rawNeeds.type ?? "GPSSD");
      state.spec = ["GPSSD2", "ESSD2"].includes(diskType) ? `${diskType}.storage` : diskType;
      const sizeGb = toGB(rawOpts.size_gb ?? rawOpts.size ?? rawOpts.capacity ?? rawOpts.storage ?? rawNeeds.capacity ?? rawNeeds.size ?? rawNeeds.storage, `${r.id}.size`);
      if (sizeGb !== undefined) options.size_gb = Math.max(10, Math.round(sizeGb));
      if (state.billing === "ondemand" && ["GPSSD2", "ESSD2"].includes(diskType)) {
        if (rawOpts.iops !== undefined) options.iops = Number(rawOpts.iops);
        if (rawOpts.throughput !== undefined && diskType === "GPSSD2") options.throughput = Number(rawOpts.throughput);
      }
      state.needs = undefined;
      return true;
    }

    case "cce": {
      const haRaw = rawOpts.control_plane_ha ?? rawOpts.ha ?? rawOpts.master_az;
      let ha = haRaw !== undefined
        ? (typeof haRaw === "string" ? haRaw.toLowerCase().includes("3") || haRaw.toLowerCase().includes("ha") : Boolean(haRaw))
        : haHint;
      const scaleRaw = String(rawOpts.scale ?? rawOpts.max_nodes ?? rawOpts.node_scale ?? rawNeeds.scale ?? "small").toLowerCase().replace(/nodes?$/, "");
      let scale = "small";
      if (["2000", "xlarge", "xl"].includes(scaleRaw)) scale = "xlarge";
      else if (["1000", "large", "l"].includes(scaleRaw)) scale = "large";
      else if (["200", "medium", "m", "mid"].includes(scaleRaw)) scale = "medium";
      else scale = "small";

      const clusterType = String(rawOpts.cluster_type ?? (state.spec === "cce.autopilot.cluster" ? "autopilot" : state.spec?.startsWith("cce.t") ? "turbo" : "standard")).toLowerCase();
      if (clusterType === "autopilot") {
        // CCE Autopilot: one cluster SKU plus optional sustained container vCPU / memory (GiB).
        state.spec = "cce.autopilot.cluster";
        options.cluster_type = "autopilot";
        const apVcpus = rawOpts.vcpus ?? rawOpts.vcpu ?? vcpus;
        const apMem = toGB(rawOpts.memory_gb ?? rawOpts.memory ?? rawOpts.mem_gb ?? memory_gb, `${r.id}.memory`);
        // The calculator page leaves the container lines unpriced unless both are >= 1, so a cluster-only card cannot be encoded.
        if (apVcpus === undefined || apMem === undefined) {
          throw new CalculatorError("VALIDATION", `${r.id}: CCE Autopilot needs both options.vcpus and options.memory_gb (each >= 1); the calculator page cannot price a cluster-only Autopilot card.`, "Set options: { cluster_type: autopilot, vcpus: N, memory_gb: M }; 1 and 1 is the smallest valid card.");
        }
        options.vcpus = Math.max(1, Math.round(Number(apVcpus)));
        options.memory_gb = Math.max(1, Math.round(apMem));
        state.needs = undefined;
        return true;
      }
      const isTurbo = clusterType === "turbo" || (state.spec ? /^cce\.t[12]\./.test(state.spec) : false);

      if (isTurbo) {
        if (state.spec && /^cce\.t[12]\.(small|medium|large)$/.test(state.spec)) {
          const parts = state.spec.split(".");
          ha = parts[1] === "t2";
          scale = parts[2]!;
        } else {
          state.spec = `cce.${ha ? "t2" : "t1"}.${scale}`;
        }
        options.cluster_type = "turbo";
      } else {
        if (state.spec && /^cce\.s[12]\.(small|medium|large|xlarge)$/.test(state.spec)) {
          const parts = state.spec.split(".");
          ha = parts[1] === "s2";
          scale = parts[2]!;
        } else {
          state.spec = `cce.${ha ? "s2" : "s1"}.${scale}`;
        }
        options.cluster_type = "standard";
      }
      options.ha = ha;
      options.scale = scale;
      if (state.billing === "ondemand") state.quantity = 1;
      state.needs = undefined;
      return true;
    }

    case "cci": {
      const cpuCount = Math.max(1, Math.round(Number(rawOpts.vcpu ?? rawOpts.vcpus ?? vcpus ?? 1)));
      const memCount = Math.max(1, Math.round(toGB(rawOpts.mem_gb ?? rawOpts.memory_gb ?? rawOpts.memory ?? memory_gb ?? 2, `${r.id}.memory`) ?? 2));
      options.vcpu = cpuCount;
      options.mem_gb = memCount;
      state.spec = state.spec ?? "cci.container.cpu";
      state.quantity = 1;
      state.billing = "ondemand";
      state.needs = undefined;
      return true;
    }

    case "obs": {
      state.quantity = 1;
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
        state.spec = `${multiAz ? "obs.storage_3az" : "obs.storage"}.${pkg}`;
      } else {
        state.billing = "ondemand";
        state.spec = "obs.001";
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
      state.needs = undefined;
      return true;
    }

    case "sfsturbo": {
      const rawTier = String(state.spec ?? rawOpts.throughput ?? rawOpts.performance ?? rawOpts.tier ?? rawNeeds.tier ?? "20MBps").trim().replace(/\/s$/i, "ps");
      const fullSpec = rawTier.startsWith("sfs.turbo.") ? rawTier : `sfs.turbo.${rawTier}`;
      state.spec = fullSpec;
      const minTb = fullSpec === "sfs.turbo.20MBps" ? 3.6 : 1.2;
      const capGb = toGB(rawOpts.capacity ?? rawOpts.size_gb ?? rawOpts.size ?? rawOpts.storage ?? rawNeeds.capacity ?? rawNeeds.size ?? rawNeeds.storage, `${r.id}.size`);
      const targetTb = capGb !== undefined ? Math.max(minTb, Math.ceil((capGb / 1024) * 10 - 1e-9) / 10) : minTb;
      options.size_gb = Number((targetTb * 1024).toFixed(1));
      if (state.billing === "ondemand") state.quantity = 1;
      state.needs = undefined;
      return true;
    }

    case "cbr": {
      state.quantity = 1;
      const vRaw = String(state.spec ?? rawOpts.vault_type ?? rawOpts.type ?? rawOpts.protects ?? rawOpts.vault_spec ?? rawNeeds.type ?? "server").toLowerCase();
      if (vRaw.startsWith("vault.")) {
        state.spec = vRaw;
      } else {
        const isMultiAz = rawOpts.redundancy === "multi-az" || rawOpts.multi_az === true || haHint;
        const suffix = isMultiAz ? "multiaz" : "normal";
        const kind = vRaw.includes("db") || vRaw.includes("database") ? "database" :
          vRaw.includes("turbo") || vRaw.includes("file") || vRaw.includes("sfs") ? "turbo" :
          vRaw.includes("vol") || vRaw.includes("disk") ? "volume" : "server";
        state.spec = kind === "volume" ? "vault.backup.volume.normal" : `vault.backup.${kind}.${suffix}`;
      }
      const capGb = toGB(rawOpts.capacity ?? rawOpts.size_gb ?? rawOpts.capacity_gb ?? rawOpts.size ?? rawOpts.storage ?? rawNeeds.capacity ?? rawNeeds.size ?? rawNeeds.storage, `${r.id}.size`);
      if (capGb !== undefined) options.size_gb = Math.max(10, Math.round(capGb));
      state.needs = undefined;
      return true;
    }

    case "sfs": {
      state.billing = "ondemand";
      state.quantity = 1;
      state.spec = state.spec ?? "SFS_SATA";
      const capGb = toGB(rawOpts.capacity ?? rawOpts.capacity_gb ?? rawOpts.storage_space_gb ?? rawOpts.size ?? rawOpts.size_gb ?? rawOpts.storage ?? rawNeeds.capacity ?? rawNeeds.storage, `${r.id}.capacity`);
      options.capacity_gb = capGb !== undefined ? Math.max(1, Math.round(capGb)) : 500;
      state.needs = undefined;
      return true;
    }

    case "dss": {
      state.billing = "yearly";
      state.quantity = 1;
      const isSas = String(state.spec ?? rawOpts.storage_type ?? rawOpts.type ?? "").toUpperCase().includes("SAS");
      state.spec = isSas ? "DSS.SAS" : "DSS.SSD";
      const rawCap = String(rawOpts.pool_capacity ?? rawOpts.capacity ?? rawOpts.size_tb ?? rawOpts.size ?? "").trim();
      const match = rawCap.match(/^([\d.]+)/);
      if (match) {
        const num = parseFloat(match[1]!);
        options.capacity = `${num.toFixed(3)} TB`;
      } else {
        options.capacity = isSas ? "43.350 TB" : "13.600 TB";
      }
      state.needs = undefined;
      return true;
    }

    case "sdrs": {
      state.billing = "ondemand";
      state.spec = state.spec ?? "sdrs_hdrs";
      const count = rawOpts.dr_pairs ?? rawOpts.protected_instances ?? rawOpts.protection_groups ?? rawOpts.instances ?? rawOpts.quantity ?? (state.quantity > 1 ? state.quantity : 1);
      options.protection_groups = Math.max(1, Math.round(Number(count)));
      state.quantity = 1;
      state.needs = undefined;
      return true;
    }

    case "des": {
      state.billing = "ondemand";
      const mediaRaw = String(rawOpts.mode ?? rawOpts.media ?? rawOpts.transfer_type ?? "").toLowerCase();
      const isTeleport = mediaRaw.includes("teleport") || ((rawOpts.onsite_days !== undefined || rawOpts.devices !== undefined) && !mediaRaw.includes("disk"));
      state.spec = state.spec ?? (isTeleport ? "des.teleport.60TB" : "des.disk");
      const days = rawOpts.onsite_days ?? rawOpts.teleport_days ?? rawOpts.devices;
      if (days !== undefined && state.spec.startsWith("des.teleport")) {
        options.devices = Math.min(99, Math.max(1, Math.round(Number(days))));
      }
      if (rawOpts.count !== undefined || rawOpts.device_count !== undefined || rawOpts.disk_count !== undefined || rawOpts.quantity !== undefined) {
        state.quantity = Math.max(1, Math.round(Number(rawOpts.count ?? rawOpts.device_count ?? rawOpts.disk_count ?? rawOpts.quantity)));
      }
      state.needs = undefined;
      return true;
    }

    case "hecs": {
      const osRaw = String(rawOpts.os ?? rawOpts.image ?? "ubuntu-22.04").trim();
      options.image = OS_MAP[osRaw.toLowerCase()] ?? osRaw;
      if (rawOpts.system_disk !== undefined) {
        options.system_disk = normalizeDisk(rawOpts.system_disk, 40);
      }
      const bw = toMbps(rawOpts.bandwidth_mbit ?? rawOpts.bandwidth, `${r.id}.bandwidth`);
      if (bw !== undefined && bw > 0) options.bandwidth_mbit = Math.round(bw);
      if (!state.spec && (!state.needs || Object.keys(state.needs).length === 0)) {
        state.needs = { vcpus: 2, memory_gb: 4 };
      }
      return true;
    }

    default:
      return false;
  }
}
