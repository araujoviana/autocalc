import { CalculatorError } from "../errors.ts";

/**
 * Shared config-driven specification conversion, topology, and storage resolution
 * for Huawei Cloud Distributed Message Service (DMS) for Kafka and RabbitMQ.
 *
 * Provenance: Normalized from Huawei Cloud calculator configuration (2026.11):
 * - Kafka: /tmp/autocalc-review-kafka-config.js (lines 343-390: ECSConversionRate & maxNodeNum)
 * - RabbitMQ: /tmp/autocalc-review-rabbitMQ-config.js (lines 580-659: ECSConversionRate3835,
 *   ECSBrokers, and ECSConversionRateAmqp091)
 * - Public regional catalogs: /tmp/autocalc-review-kafka-{sa-brazil-1,la-south-2}.json (8 specs each)
 *   and rabbitMQ-{sa-brazil-1,la-south-2}.json (27 specs each)
 * Note: RocketMQ and Reliability services remain strictly excluded.
 */

export type DmsService = "kafka" | "rabbitmq";
export type DmsStorageChoice = "high" | "ultra";

export interface DmsSelection {
  specId: string;
  brokers: number;
  version?: string | undefined;
  storageType?: string | undefined;
}

export interface DmsSpecConfig {
  specId: string;
  architecture: "single" | "cluster";
  conversionRate: number;
  version?: "3.8" | "amqp" | undefined;
  minBrokers: number;
  maxBrokers: number;
  allowedBrokers?: number[] | undefined;
}

export interface DmsStorageConfig {
  choice: DmsStorageChoice;
  specCode: string;
  storageType: string;
  storageUnit: string;
}

export interface DmsRegionalServiceConfig {
  specs: Record<string, DmsSpecConfig>;
  storage: Record<DmsStorageChoice, DmsStorageConfig>;
}

export interface DmsConfigSource {
  provenance: string;
  regions: Record<string, {
    kafka: DmsRegionalServiceConfig;
    rabbitmq: DmsRegionalServiceConfig;
  }>;
}

export interface ResolvedDmsConfig {
  service: DmsService;
  region: string;
  specId: string;
  architecture: "single" | "cluster";
  version?: string | undefined;
  versionCode?: string | undefined;
  conversionRate: number;
  storageChoice: DmsStorageChoice;
  storageSpec: string;
  storageType: string;
  storageUnit: string;
  allowedBrokers: number[];
}

// 8 Kafka specifications offered in LATAM regions (sa-brazil-1 and la-south-2)
const KAFKA_SPECS_LATAM: Record<string, DmsSpecConfig> = {
  "kafka.2u4g.single.small": { specId: "kafka.2u4g.single.small", architecture: "single", conversionRate: 5, minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "kafka.2u4g.single": { specId: "kafka.2u4g.single", architecture: "single", conversionRate: 7, minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "s6.2u4g.cluster.small": { specId: "s6.2u4g.cluster.small", architecture: "cluster", conversionRate: 5, minBrokers: 3, maxBrokers: 30 },
  "c6.2u4g.cluster": { specId: "c6.2u4g.cluster", architecture: "cluster", conversionRate: 7, minBrokers: 3, maxBrokers: 30 },
  "c6.4u8g.cluster": { specId: "c6.4u8g.cluster", architecture: "cluster", conversionRate: 14, minBrokers: 3, maxBrokers: 30 },
  "c6.8u16g.cluster": { specId: "c6.8u16g.cluster", architecture: "cluster", conversionRate: 27, minBrokers: 3, maxBrokers: 50 },
  "c6.12u24g.cluster": { specId: "c6.12u24g.cluster", architecture: "cluster", conversionRate: 41, minBrokers: 3, maxBrokers: 50 },
  "c6.16u32g.cluster": { specId: "c6.16u32g.cluster", architecture: "cluster", conversionRate: 50, minBrokers: 3, maxBrokers: 50 },
};

const KAFKA_STORAGE_LATAM: Record<DmsStorageChoice, DmsStorageConfig> = {
  ultra: {
    choice: "ultra",
    specCode: "dms.physical.storage.ultra.v2.kafka",
    storageType: "dataInfo_7_",
    storageUnit: "detail_9_",
  },
  high: {
    choice: "high",
    specCode: "dms.physical.storage.high.v2.kafka",
    storageType: "dataInfo_6_",
    storageUnit: "detail_9_",
  },
};

// 27 RabbitMQ specifications offered in LATAM regions (12 for 3.8, 15 for AMQP)
const RABBITMQ_SPECS_LATAM: Record<string, DmsSpecConfig> = {
  // Version 3.8 - single-node (exactly 1 broker)
  "c6.2u4g.single": { specId: "c6.2u4g.single", architecture: "single", conversionRate: 7, version: "3.8", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "c6.4u8g.single": { specId: "c6.4u8g.single", architecture: "single", conversionRate: 14, version: "3.8", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "c6.8u16g.single": { specId: "c6.8u16g.single", architecture: "single", conversionRate: 27, version: "3.8", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "c6.16u32g.single": { specId: "c6.16u32g.single", architecture: "single", conversionRate: 50, version: "3.8", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "c6.24u48g.single": { specId: "c6.24u48g.single", architecture: "single", conversionRate: 75, version: "3.8", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },

  // Version 3.8 - cluster (vendor allowedBrokers: [3, 5, 7])
  "c6.2u4g.cluster": { specId: "c6.2u4g.cluster", architecture: "cluster", conversionRate: 7, version: "3.8", minBrokers: 3, maxBrokers: 7, allowedBrokers: [3, 5, 7] },
  "c6.4u8g.cluster": { specId: "c6.4u8g.cluster", architecture: "cluster", conversionRate: 14, version: "3.8", minBrokers: 3, maxBrokers: 7, allowedBrokers: [3, 5, 7] },
  "c6.8u16g.cluster": { specId: "c6.8u16g.cluster", architecture: "cluster", conversionRate: 27, version: "3.8", minBrokers: 3, maxBrokers: 7, allowedBrokers: [3, 5, 7] },
  "c6.12u24g.cluster": { specId: "c6.12u24g.cluster", architecture: "cluster", conversionRate: 41, version: "3.8", minBrokers: 3, maxBrokers: 7, allowedBrokers: [3, 5, 7] },
  "c6.16u32g.cluster": { specId: "c6.16u32g.cluster", architecture: "cluster", conversionRate: 50, version: "3.8", minBrokers: 3, maxBrokers: 7, allowedBrokers: [3, 5, 7] },
  "c6.24u48g.cluster": { specId: "c6.24u48g.cluster", architecture: "cluster", conversionRate: 75, version: "3.8", minBrokers: 3, maxBrokers: 7, allowedBrokers: [3, 5, 7] },
  "c6.32u64g.cluster": { specId: "c6.32u64g.cluster", architecture: "cluster", conversionRate: 100, version: "3.8", minBrokers: 3, maxBrokers: 7, allowedBrokers: [3, 5, 7] },

  // Version AMQP (0.9.1) - both p1 and p2 instantiate exactly 1 ECS (allowedBrokers: [1])
  "amqp.p1.large.2": { specId: "amqp.p1.large.2", architecture: "single", conversionRate: 7, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p1.large.4": { specId: "amqp.p1.large.4", architecture: "single", conversionRate: 14, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.6": { specId: "amqp.p2.large.6", architecture: "cluster", conversionRate: 21, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.10": { specId: "amqp.p2.large.10", architecture: "cluster", conversionRate: 35, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.14": { specId: "amqp.p2.large.14", architecture: "cluster", conversionRate: 49, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.20": { specId: "amqp.p2.large.20", architecture: "cluster", conversionRate: 70, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.28": { specId: "amqp.p2.large.28", architecture: "cluster", conversionRate: 98, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.40": { specId: "amqp.p2.large.40", architecture: "cluster", conversionRate: 135, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.56": { specId: "amqp.p2.large.56", architecture: "cluster", conversionRate: 189, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.80": { specId: "amqp.p2.large.80", architecture: "cluster", conversionRate: 205, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.112": { specId: "amqp.p2.large.112", architecture: "cluster", conversionRate: 387, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.144": { specId: "amqp.p2.large.144", architecture: "cluster", conversionRate: 300, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.200": { specId: "amqp.p2.large.200", architecture: "cluster", conversionRate: 375, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.240": { specId: "amqp.p2.large.240", architecture: "cluster", conversionRate: 500, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
  "amqp.p2.large.280": { specId: "amqp.p2.large.280", architecture: "cluster", conversionRate: 525, version: "amqp", minBrokers: 1, maxBrokers: 1, allowedBrokers: [1] },
};

const RABBITMQ_STORAGE_LATAM: Record<DmsStorageChoice, DmsStorageConfig> = {
  ultra: {
    choice: "ultra",
    specCode: "dms.physical.storage.ultra.v2.rabbitmq",
    storageType: "dataInfo_12_",
    storageUnit: "detail_19_",
  },
  high: {
    choice: "high",
    specCode: "dms.physical.storage.high.v2.rabbitmq",
    storageType: "dataInfo_11_",
    storageUnit: "detail_19_",
  },
};

export const DEFAULT_DMS_CONFIG_SOURCE: DmsConfigSource = {
  provenance: "Normalized from Huawei Cloud calculator configuration (2026.11): kafka-config.js (lines 343-390) and rabbitMQ-config.js (lines 580-659) with public regional catalogs",
  regions: {
    "sa-brazil-1": {
      kafka: { specs: KAFKA_SPECS_LATAM, storage: KAFKA_STORAGE_LATAM },
      rabbitmq: { specs: RABBITMQ_SPECS_LATAM, storage: RABBITMQ_STORAGE_LATAM },
    },
    "la-south-2": {
      kafka: { specs: KAFKA_SPECS_LATAM, storage: KAFKA_STORAGE_LATAM },
      rabbitmq: { specs: RABBITMQ_SPECS_LATAM, storage: RABBITMQ_STORAGE_LATAM },
    },
  },
};

/**
 * Resolves DMS configuration from vendor configuration source, validating:
 * 1. Regional availability of the service and specification
 * 2. Version compatibility (for RabbitMQ: 3.8 vs amqp)
 * 3. Broker count bounds (Kafka: 1 for single, 3..maxNodeNum for cluster; RabbitMQ: 1 for single/amqp, [3, 5, 7] for 3.8 cluster)
 * 4. Storage choice (high vs ultra, resolving modern .v2 storage specs)
 */
export function resolveDmsConfig(
  service: DmsService,
  region: string,
  selection: DmsSelection,
  source: DmsConfigSource = DEFAULT_DMS_CONFIG_SOURCE
): ResolvedDmsConfig {
  const regional = source.regions[region];
  if (!regional) {
    throw new CalculatorError("VALIDATION", `Region '${region}' is not configured for DMS ${service}`);
  }

  const regionalService = regional[service];
  if (!regionalService) {
    throw new CalculatorError("VALIDATION", `DMS ${service} is not supported in region '${region}'`);
  }

  const specConfig = regionalService.specs[selection.specId];
  if (!specConfig) {
    throw new CalculatorError("VALIDATION", `Unknown ${service} specification '${selection.specId}': missing conversion metadata`);
  }

  // Version validation for RabbitMQ
  let normalizedVersion: string | undefined;
  let versionCode: string | undefined;
  if (service === "rabbitmq") {
    const rawVersion = selection.version;
    if (rawVersion !== undefined) {
      if (rawVersion === "3.8" || rawVersion === "3.8.35") {
        normalizedVersion = "3.8";
        versionCode = "dataInfo_30_";
      } else if (rawVersion === "amqp" || rawVersion === "0.9.1") {
        normalizedVersion = "amqp";
        versionCode = "dataInfo_29_";
      } else {
        throw new CalculatorError("VALIDATION", `Unknown RabbitMQ version '${rawVersion}'. Supported versions: 3.8, amqp`);
      }
    } else {
      normalizedVersion = specConfig.version ?? "3.8";
      versionCode = normalizedVersion === "amqp" ? "dataInfo_29_" : "dataInfo_30_";
    }

    if (specConfig.version && specConfig.version !== normalizedVersion) {
      throw new CalculatorError(
        "VALIDATION",
        `RabbitMQ specification ${selection.specId} is incompatible with version ${rawVersion} (must use version ${specConfig.version})`
      );
    }
  }

  // Storage selection validation (default: ultra)
  const rawChoice = selection.storageType;
  let storageChoice: DmsStorageChoice = "ultra";
  if (rawChoice) {
    if (rawChoice === "high" || rawChoice === "high-io" || rawChoice === "high_io") {
      storageChoice = "high";
    } else if (rawChoice === "ultra" || rawChoice === "ultra-high-io" || rawChoice === "ultra_high_io") {
      storageChoice = "ultra";
    } else {
      throw new CalculatorError("VALIDATION", `Storage type '${rawChoice}' is not supported for DMS ${service}`);
    }
  }

  const storageConfig = regionalService.storage[storageChoice];
  if (!storageConfig) {
    throw new CalculatorError("VALIDATION", `Storage type '${storageChoice}' is not offered for DMS ${service} in region '${region}'`);
  }

  // Broker count topology validation
  const brokers = selection.brokers;
  if (!Number.isInteger(brokers)) {
    throw new CalculatorError(
      "VALIDATION",
      `Broker count for ${service} specification ${selection.specId} must be an integer, got ${brokers}`
    );
  }
  if (specConfig.allowedBrokers) {
    if (!specConfig.allowedBrokers.includes(brokers)) {
      if (specConfig.allowedBrokers.length === 1 && specConfig.allowedBrokers[0] === 1) {
        if (specConfig.version === "amqp") {
          throw new CalculatorError("VALIDATION", `RabbitMQ AMQP specification ${selection.specId} requires exactly 1 broker, got ${brokers}`);
        }
        throw new CalculatorError("VALIDATION", `Single-node ${service} specification ${selection.specId} requires exactly 1 broker, got ${brokers}`);
      }
      throw new CalculatorError(
        "VALIDATION",
        `Invalid broker count ${brokers} for ${service} specification ${selection.specId}. Allowed: ${specConfig.allowedBrokers.join(", ")}`
      );
    }
  } else {
    if (brokers < specConfig.minBrokers || brokers > specConfig.maxBrokers) {
      throw new CalculatorError(
        "VALIDATION",
        `Broker count ${brokers} for Kafka specification ${selection.specId} must be between ${specConfig.minBrokers} and ${specConfig.maxBrokers} (vendor limit)`
      );
    }
  }

  const allowedBrokers = specConfig.allowedBrokers ??
    Array.from({ length: specConfig.maxBrokers - specConfig.minBrokers + 1 }, (_, i) => i + specConfig.minBrokers);

  return {
    service,
    region,
    specId: selection.specId,
    architecture: specConfig.architecture,
    version: normalizedVersion,
    versionCode,
    conversionRate: specConfig.conversionRate,
    storageChoice,
    storageSpec: storageConfig.specCode,
    storageType: storageConfig.storageType,
    storageUnit: storageConfig.storageUnit,
    allowedBrokers,
  };
}

/**
 * Backward-compatible helper for resolving Kafka DMS configuration.
 */
export function resolveKafkaConfig(
  specId: string,
  brokers: number,
  region = "sa-brazil-1",
  storageType?: DmsStorageChoice | undefined,
  source?: DmsConfigSource | undefined
): ResolvedDmsConfig {
  return resolveDmsConfig("kafka", region, { specId, brokers, storageType }, source);
}

/**
 * Backward-compatible helper for resolving RabbitMQ DMS configuration.
 */
export function resolveRabbitmqConfig(
  specId: string,
  brokers: number,
  version = "3.8",
  region = "sa-brazil-1",
  storageType?: DmsStorageChoice | undefined,
  source?: DmsConfigSource | undefined
): ResolvedDmsConfig {
  return resolveDmsConfig("rabbitmq", region, { specId, brokers, version, storageType }, source);
}
