/** Database, cache, and messaging middleware card normalization rules. */
import { CalculatorError } from "../../errors.ts";
import {
  type CardNormalizeState,
  KAFKA_SPEC_ALIASES,
  pickNearestRedisMem,
  RABBITMQ_SPEC_ALIASES,
  sizeFromVcpu,
  toGB,
} from "./shared.ts";

/** Normalizes database and middleware services into `state`; returns false if unhandled. */
export function normalizeDatabaseMiddlewareService(state: CardNormalizeState): boolean {
  const { r, service, rawNeeds, rawOpts, vcpus, memory_gb, engine, topology, haHint, options } = state;

  switch (service) {
    case "rds": {
      const stGb = toGB(rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) options.storage_gb = Math.max(40, Math.round(stGb));
      if (rawOpts.db_version !== undefined || rawOpts.version !== undefined || rawNeeds.version !== undefined) {
        options.db_version = String(rawOpts.db_version ?? rawOpts.version ?? rawNeeds.version);
      }
      if (!state.spec && rawOpts.flavor !== undefined) state.spec = String(rawOpts.flavor);
      const isMssql = engine.includes("sqlserver") || engine.includes("mssql");
      const eng = engine.includes("pg") || engine.includes("postgres") ? "pg" : isMssql ? "mssql" : "mysql";
      if (!state.spec) {
        const v = vcpus ?? 2;
        const m = memory_gb ?? v * 4;
        const sz = sizeFromVcpu(v);
        const rawRatio = Math.round(m / v);
        const ratio = rawRatio >= 6 ? 8 : rawRatio >= 3 ? 4 : 2;
        const cls = ratio === 8 || v >= 32 ? "x1" : "n1";
        // An explicit type/topology wins over the environment availability default.
        const explicit = String(rawOpts.type ?? rawOpts.topology ?? "").trim().toLowerCase();
        const RDS_SINGLE = ["single", "single-node", "standalone"];
        const RDS_HA = ["ha", "primary-standby", "primary_standby", "standby", "multi-az", "cluster"];
        if (explicit && !RDS_SINGLE.includes(explicit) && !RDS_HA.includes(explicit)) {
          throw new CalculatorError("VALIDATION", `${r.id}: unknown RDS options.type '${explicit}'.`, `Use one of: ${[...RDS_SINGLE.slice(0, 1), "primary-standby", "ha"].join(", ")} (also accepted: ${[...RDS_SINGLE.slice(1), ...RDS_HA.slice(2)].join(", ")}).`);
        }
        const isHa = explicit ? RDS_HA.includes(explicit) : haHint;
        if (isMssql) {
          const edRaw = String(rawOpts.edition ?? rawOpts.version ?? rawOpts.db_version ?? "").toLowerCase();
          const edition = edRaw.includes("web") && !isHa
            ? "web"
            : edRaw.includes("ee") || edRaw.includes("enterprise")
              ? "ee"
              : edRaw.includes("se") || edRaw.includes("standard")
                ? "se"
                : ratio === 8 || v >= 8
                  ? "ee"
                  : "se";
          const mssqlRatio = edition === "se" && isHa && ratio === 4 ? 2 : ratio;
          const mssqlCls = mssqlRatio === 2 ? "n1" : edition === "web" && mssqlRatio === 4 ? "n1" : "x1";
          state.spec = `rds.mssql.byol.${mssqlCls}.${edition}.${sz}.${mssqlRatio}${isHa ? ".ha" : ""}`;
        } else {
          state.spec = `rds.${eng}.${cls}.${sz}.${ratio}${isHa ? ".ha" : ""}`;
        }
      }
      const volRaw = rawOpts.storage_spec ?? rawOpts.volume_type ?? rawOpts.storage_type;
      if (typeof volRaw === "string" && volRaw.trim() !== "") {
        const volTrim = volRaw.trim();
        if (volTrim.startsWith("rds.")) {
          options.storage_spec = volTrim;
        } else {
          const specEng = state.spec?.split(".")[1] || eng;
          const haSuffix = state.spec?.endsWith(".rha.rr") ? ".rha.rr" : state.spec?.endsWith(".ha") ? ".ha" : state.spec?.endsWith(".rr") ? ".rr" : "";
          const norm = volTrim.toLowerCase();
          const media = norm.includes("extreme") || norm === "essd"
            ? "essd"
            : norm.includes("ultra")
              ? "ultrahigh"
              : norm.includes("common") || norm.includes("sata")
                ? "common"
                : norm.includes("gpssd2")
                  ? "gpssd2"
                  : norm.includes("ssd")
                    ? "cloudssd"
                    : "";
          if (media) options.storage_spec = `rds.${specEng}.volume.${media}${haSuffix}`;
        }
      }
      state.needs = undefined;
      return true;
    }

    case "kafka": {
      const explicitSpecRaw = rawOpts.flavor ?? rawOpts.spec ?? rawOpts.spec_id ?? rawOpts.specification ?? rawOpts.flavor_id ?? (state.spec && state.spec !== "dms.platinum.c6.kafka" && state.spec !== "kafka" && state.spec !== "dms-kafka" && state.spec !== "dmq" ? state.spec : undefined);
      const isSpecExplicit = explicitSpecRaw !== undefined && String(explicitSpecRaw).trim() !== "";
      let specId: string;
      if (isSpecExplicit) {
        const trimmed = String(explicitSpecRaw).trim();
        specId = KAFKA_SPEC_ALIASES[trimmed] ?? trimmed;
      } else {
        const v = vcpus ?? (haHint || (rawOpts.brokers !== undefined && Number(rawOpts.brokers) >= 3) ? 2 : 2);
        if (haHint || (rawOpts.brokers !== undefined && Number(rawOpts.brokers) >= 3)) {
          specId = v >= 16 ? "c6.16u32g.cluster" : v >= 12 ? "c6.12u24g.cluster" : v >= 8 ? "c6.8u16g.cluster" : v >= 4 ? "c6.4u8g.cluster" : "c6.2u4g.cluster";
        } else {
          specId = "kafka.2u4g.single.small";
        }
      }
      options.spec_id = specId;

      const rawBrokers = rawOpts.brokers ?? rawOpts.broker_count ?? rawOpts.nodes ?? rawOpts.node_count ?? rawNeeds.nodes ?? rawNeeds.replicas ?? rawNeeds.brokers;
      if (rawBrokers !== undefined) {
        const parsed = Number(rawBrokers);
        options.brokers = Number.isNaN(parsed) ? rawBrokers : parsed;
      } else {
        options.brokers = specId.includes(".single") ? 1 : 3;
      }

      const stGb = toGB(rawOpts.storage_per_broker_gb ?? rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) {
        options.storage_gb = Math.round(stGb);
      } else {
        options.storage_gb = 100;
      }
      if (rawOpts.storage_type !== undefined) options.storage_type = String(rawOpts.storage_type);
      state.spec = "dms.platinum.c6.kafka";
      state.needs = undefined;
      return true;
    }

    case "rabbitmq": {
      const explicitSpecRaw = rawOpts.flavor ?? rawOpts.spec ?? rawOpts.spec_id ?? rawOpts.specification ?? rawOpts.flavor_id ?? (state.spec && state.spec !== "dms.platinum.c6.rabbitmq" && state.spec !== "rabbitmq" && state.spec !== "dms-rabbitmq" ? state.spec : undefined);
      const isSpecExplicit = explicitSpecRaw !== undefined && String(explicitSpecRaw).trim() !== "";
      let specId: string;
      if (isSpecExplicit) {
        const trimmed = String(explicitSpecRaw).trim();
        specId = RABBITMQ_SPEC_ALIASES[trimmed] ?? trimmed;
      } else {
        const v = vcpus ?? 2;
        if (haHint || (rawOpts.brokers !== undefined && Number(rawOpts.brokers) >= 3)) {
          specId = v >= 16 ? "c6.16u32g.cluster" : v >= 8 ? "c6.8u16g.cluster" : v >= 4 ? "c6.4u8g.cluster" : "c6.2u4g.cluster";
        } else {
          specId = v >= 16 ? "c6.16u32g.single" : v >= 8 ? "c6.8u16g.single" : v >= 4 ? "c6.4u8g.single" : "c6.2u4g.single";
        }
      }
      options.spec_id = specId;

      const isAmqp = specId.startsWith("amqp.");
      const rawBrokers = rawOpts.brokers ?? rawOpts.broker_count ?? rawOpts.nodes ?? rawOpts.node_count ?? rawNeeds.nodes ?? rawNeeds.replicas ?? rawNeeds.brokers;
      if (rawBrokers !== undefined) {
        const parsed = Number(rawBrokers);
        options.brokers = Number.isNaN(parsed) ? rawBrokers : parsed;
      } else {
        options.brokers = (specId.endsWith(".single") || isAmqp) ? 1 : 3;
      }

      const stGb = toGB(rawOpts.storage_per_broker_gb ?? rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) {
        options.storage_gb = Math.round(stGb);
      } else {
        options.storage_gb = 100;
      }

      if (rawOpts.version !== undefined || rawOpts.engine_version !== undefined) {
        options.version = String(rawOpts.version ?? rawOpts.engine_version);
      } else if (isAmqp) {
        options.version = "amqp";
      }
      if (rawOpts.storage_type !== undefined) options.storage_type = String(rawOpts.storage_type);
      state.spec = "dms.platinum.c6.rabbitmq";
      state.needs = undefined;
      return true;
    }

    case "nosql": {
      let flavor = String(rawOpts.flavor ?? (state.spec ? state.spec.replace(/^geminidb\.cassandra-geminifs\./, "") : "")).trim();
      if (!flavor || !flavor.endsWith(".4")) {
        flavor = `${sizeFromVcpu(vcpus ?? 2)}.4`;
      }
      options.flavor = flavor;
      options.nodes = Math.max(2, Math.round(Number(rawOpts.nodes ?? rawOpts.node_count ?? rawOpts.replicas ?? (state.quantity > 1 ? state.quantity : 3))));
      const stGb = toGB(rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      options.storage_gb = stGb !== undefined ? Math.max(100, Math.round(stGb)) : 100;
      options.engine = "dynamodb";
      state.spec = `geminidb.cassandra-geminifs.${flavor}`;
      state.quantity = 1;
      state.needs = undefined;
      return true;
    }

    case "redis": {
      const instances = Math.max(1, Math.round(Number(rawOpts.instances ?? rawOpts.quantity ?? (state.quantity > 1 ? state.quantity : 1))));
      if (instances > 1 || rawOpts.instances !== undefined) options.instances = instances;
      state.quantity = 1;
      if (!state.spec) {
        const mem = pickNearestRedisMem(Math.round(memory_gb ?? toGB(rawOpts.capacity_gb ?? rawOpts.memory_gb ?? rawOpts.memory ?? rawOpts.capacity ?? rawOpts.size, `${r.id}.memory`) ?? 4));
        const top = String(rawOpts.topology ?? rawOpts.instance_type ?? topology).toLowerCase();
        if (top.includes("cluster")) {
          state.spec = `redis.cluster.xu1.large.r2.${Math.max(4, mem)}`;
        } else if (haHint || top.includes("standby") || top.includes("ha")) {
          state.spec = `redis.ha.xu1.large.r2.${mem}`;
        } else {
          state.spec = `redis.single.xu1.large.${mem}`;
        }
      }
      state.needs = undefined;
      return true;
    }

    case "memcached": {
      state.billing = "ondemand";
      state.spec = state.spec ?? (haHint ? "dcs.memcached.master_standby" : "dcs.memcached.single_node");
      const mem = toGB(rawOpts.memory_gb ?? rawOpts.capacity_gb ?? rawOpts.memory ?? rawOpts.capacity ?? rawOpts.size ?? memory_gb, `${r.id}.memory`);
      if (mem !== undefined) options.memory_gb = Math.max(2, Math.round(mem));
      state.needs = undefined;
      return true;
    }

    case "dds": {
      const shardCount = rawOpts.shards ?? rawOpts.shard_count ?? (rawOpts.nodes !== undefined ? Number(rawOpts.nodes) : undefined);
      if (!state.spec) {
        state.spec = `dds.mongodb.c6.${sizeFromVcpu(vcpus ?? 2)}.8.${shardCount ? "shard" : "repset"}`;
      }
      for (const field of ["type", "flavor_type", "mongos_spec", "shard_spec", "config_spec"] as const) {
        if (rawOpts[field] !== undefined) options[field] = String(rawOpts[field]);
      }
      if (rawOpts.mongos !== undefined) options.mongos = Math.min(32, Math.max(2, Math.round(Number(rawOpts.mongos))));
      if (rawOpts.config_storage_gb !== undefined) options.config_storage_gb = Math.max(20, Math.round(Number(rawOpts.config_storage_gb) / 10) * 10);
      if (shardCount !== undefined) options.shards = Math.min(32, Math.max(2, Math.round(Number(shardCount))));
      const stGb = toGB(rawOpts.shard_storage_gb ?? rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) options.shard_storage_gb = Math.min(5000, Math.max(10, Math.round(stGb / 10) * 10));
      state.needs = undefined;
      return true;
    }

    case "gaussdb": {
      if (rawOpts.deployment_mode !== undefined || rawOpts.deploy_model !== undefined || rawOpts.edition !== undefined) {
        const dm = String(rawOpts.deployment_mode ?? rawOpts.deploy_model ?? rawOpts.edition).toLowerCase();
        options.deploy_model = dm.includes("dist") ? "distributed" : "centralized";
      }
      for (const field of ["instance_type", "db_version", "database_type", "public_type", "spec"] as const) {
        if (rawOpts[field] !== undefined) options[field] = String(rawOpts[field]);
      }
      if (!state.spec) {
        const v = vcpus ?? 16;
        const sz = v >= 64 ? "16xlarge" : v >= 32 ? "8xlarge" : "4xlarge";
        state.spec = `gaussdb.bs.c6.${sz}.x864.ha`;
      }
      const stGb = toGB(rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) options.storage_gb = Math.min(24000, Math.max(40, Math.round(stGb / 4) * 4));
      state.needs = undefined;
      return true;
    }

    case "taurusdb": {
      if (!state.spec) {
        state.spec = `gaussdb.mysql.${sizeFromVcpu(vcpus ?? 4)}.x86.4`;
      }
      const nodeCount = rawOpts.nodes ?? rawOpts.node_count ?? (rawOpts.replicas !== undefined ? Number(rawOpts.replicas) + 1 : undefined);
      if (nodeCount !== undefined) options.nodes = Math.min(10, Math.max(2, Math.round(Number(nodeCount))));
      if (rawOpts.topology !== undefined || rawOpts.enterprise_instance !== undefined) {
        options.enterprise_instance = String(rawOpts.topology ?? rawOpts.enterprise_instance).toLowerCase().includes("multi") ? "multi-master" : "standard";
      }
      const stGb = toGB(rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) options.storage_gb = Math.min(128000, Math.max(40, Math.round(stGb / 10) * 10));
      state.needs = undefined;
      return true;
    }

    case "rdsformariadb": {
      if (!state.spec) {
        state.spec = `mariadb.x1.${sizeFromVcpu(vcpus ?? 4)}.4.ha`;
      }
      if (rawOpts.version !== undefined || rawOpts.db_version !== undefined) {
        options.db_version = String(rawOpts.version ?? rawOpts.db_version);
      }
      if (rawOpts.topology !== undefined || rawOpts.instance_type !== undefined) {
        const top = String(rawOpts.topology ?? rawOpts.instance_type).toLowerCase();
        options.instance_type = top.includes("single") ? "Single" : "Ha";
      }
      for (const field of ["public_type", "spec"] as const) {
        if (rawOpts[field] !== undefined) options[field] = String(rawOpts[field]);
      }
      const stGb = toGB(rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) options.storage_gb = Math.min(4000, Math.max(40, Math.round(stGb / 10) * 10));
      state.needs = undefined;
      return true;
    }

    case "hrds": {
      if (state.billing === "ondemand") state.billing = "monthly";
      if (!state.spec || !state.spec.includes(".y1.")) {
        const engRaw = String(rawOpts.engine ?? rawOpts.db_type ?? rawNeeds.engine ?? "mysql").toLowerCase();
        const eng = engRaw.includes("pg") || engRaw.includes("postgres") ? "pg" : "mysql";
        const sz = (vcpus ?? 4) >= 4 ? "xlarge.2" : (memory_gb ?? 8) >= 8 ? "large.4" : "large.2";
        const isHa = haHint || String(rawOpts.topology ?? rawOpts.instance_type ?? "").toLowerCase().includes("ha") || String(rawOpts.topology ?? rawOpts.instance_type ?? "").toLowerCase().includes("standby");
        const haSuffix = isHa ? ".ha" : "";
        state.spec = `rds.${eng}.y1.${sz}${haSuffix}`;
      }
      for (const field of ["db_type", "instance_type", "spec"] as const) {
        if (rawOpts[field] !== undefined) options[field] = String(rawOpts[field]);
      }
      if (rawOpts.version !== undefined || rawOpts.db_version !== undefined) options.db_version = String(rawOpts.version ?? rawOpts.db_version);
      const stGb = toGB(rawOpts.storage_gb ?? rawOpts.storage ?? rawOpts.capacity ?? rawOpts.size ?? rawNeeds.storage ?? rawNeeds.capacity, `${r.id}.storage`);
      if (stGb !== undefined) options.storage_gb = Math.max(120, Math.round(stGb / 10) * 10);
      state.needs = undefined;
      return true;
    }

    case "ddm": {
      if (!state.spec) {
        const v = vcpus ?? 8;
        const sz = v >= 32 ? "8xlarge" : v >= 16 ? "4xlarge" : "2xlarge";
        state.spec = `ddm.c6.${sz}.2`;
      }
      if (rawOpts.spec_type !== undefined) options.spec_type = String(rawOpts.spec_type);
      if (rawOpts.spec !== undefined) options.spec = String(rawOpts.spec);
      const nodes = rawOpts.nodes ?? rawOpts.node_count;
      if (nodes !== undefined) state.quantity = Math.max(2, Math.round(Number(nodes)));
      state.needs = undefined;
      return true;
    }

    case "drs": {
      if (!state.spec || !state.spec.startsWith("drs.")) {
        const flow = String(rawOpts.direction ?? rawOpts.flow ?? rawOpts.task_type ?? rawNeeds.flow ?? "").toLowerCase();
        state.spec = flow.includes("sync") ? "drs.xlg.sync" : "drs.med.dr";
      }
      if (rawOpts.type !== undefined) options.type = String(rawOpts.type);
      if (rawOpts.flow !== undefined) options.flow = String(rawOpts.flow);
      else if (rawOpts.direction !== undefined) options.flow = String(rawOpts.direction);
      if (rawOpts.specification !== undefined) options.specification = String(rawOpts.specification);
      else if (rawOpts.scale !== undefined) options.specification = String(rawOpts.scale);
      state.needs = undefined;
      return true;
    }

    default:
      return false;
  }
}
