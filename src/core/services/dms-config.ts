import { CalculatorError } from "../errors.ts";

/**
 * Shared config-driven specification conversion, topology, and storage resolution
 * for Huawei Cloud Distributed Message Service (DMS) for Kafka and RabbitMQ.
 * Sourced directly from public portal calculators (2026.11).
 * Note: RocketMQ and Reliability services remain strictly excluded.
 */

export const KAFKA_CONVERSION_RATES: Record<string, number> = {
  "kafka.2u4g.single.small": 5,
  "kafka.2u4g.single": 7,
  "s6.2u4g.cluster.small": 5,
  "c6.2u4g.cluster": 7,
  "c6.4u8g.cluster": 14,
  "c6.8u16g.cluster": 27,
  "c6.12u24g.cluster": 41,
  "c6.16u32g.cluster": 50,
};

export const RABBITMQ_CONVERSION_RATES_38: Record<string, number> = {
  "c6.2u4g.single": 7,
  "c6.4u8g.single": 14,
  "c6.8u16g.single": 27,
  "c6.16u32g.single": 50,
  "c6.24u48g.single": 75,
  "c6.2u4g.cluster": 7,
  "c6.4u8g.cluster": 14,
  "c6.8u16g.cluster": 27,
  "c6.12u24g.cluster": 41,
  "c6.16u32g.cluster": 50,
  "c6.24u48g.cluster": 75,
  "c6.32u64g.cluster": 100,
};

export const RABBITMQ_CONVERSION_RATES_AMQP: Record<string, number> = {
  "amqp.p1.large.2": 7,
  "amqp.p1.large.4": 14,
  "amqp.p2.large.6": 21,
  "amqp.p2.large.10": 35,
  "amqp.p2.large.14": 49,
  "amqp.p2.large.20": 70,
  "amqp.p2.large.28": 98,
  "amqp.p2.large.40": 135,
  "amqp.p2.large.56": 189,
  "amqp.p2.large.80": 205,
  "amqp.p2.large.112": 387,
  "amqp.p2.large.144": 300,
  "amqp.p2.large.200": 375,
  "amqp.p2.large.240": 500,
  "amqp.p2.large.280": 525,
};

export interface DmsResolvedConfig {
  service: "kafka" | "rabbitmq";
  specId: string;
  architecture: "single" | "cluster";
  conversionRate: number;
  storageSpec: string;
  storageType: string;
  allowedBrokers: number[];
  storageUnit: string;
}

/**
 * Resolves DMS Kafka configuration and validates broker topology.
 */
export function resolveKafkaConfig(specId: string, brokers: number): DmsResolvedConfig {
  const conversionRate = KAFKA_CONVERSION_RATES[specId];
  if (conversionRate === undefined) {
    throw new CalculatorError("VALIDATION", `Unknown Kafka specification ${specId}`);
  }

  const isSingle = specId.includes(".single");
  const architecture = isSingle ? "single" : "cluster";

  if (isSingle) {
    if (brokers !== 1) {
      throw new CalculatorError("VALIDATION", `Single-node Kafka specification ${specId} requires exactly 1 broker, got ${brokers}`);
    }
  } else {
    if (brokers < 3) {
      throw new CalculatorError("VALIDATION", `Cluster Kafka specification ${specId} requires at least 3 brokers, got ${brokers}`);
    }
  }

  return {
    service: "kafka",
    specId,
    architecture,
    conversionRate,
    storageSpec: "dms.physical.storage.ultra.v2.kafka",
    storageType: "dataInfo_7_",
    allowedBrokers: isSingle ? [1] : [3, 5, 7, 9, 11, 13, 15],
    storageUnit: "detail_9_",
  };
}

/**
 * Resolves DMS RabbitMQ configuration and validates broker topology.
 */
export function resolveRabbitmqConfig(specId: string, brokers: number, version = "3.8"): DmsResolvedConfig {
  let conversionRate: number | undefined;
  if (version === "amqp" || specId.startsWith("amqp.")) {
    conversionRate = RABBITMQ_CONVERSION_RATES_AMQP[specId];
  } else {
    conversionRate = RABBITMQ_CONVERSION_RATES_38[specId];
  }

  if (conversionRate === undefined) {
    throw new CalculatorError("VALIDATION", `Unknown RabbitMQ specification ${specId}`);
  }

  const isSingle = specId.endsWith(".single") || specId.startsWith("amqp.p1.");
  const architecture = isSingle ? "single" : "cluster";

  if (specId.startsWith("c6.")) {
    const allowed = isSingle ? [1] : [3, 5, 7];
    if (!allowed.includes(brokers)) {
      throw new CalculatorError(
        "VALIDATION",
        `Invalid broker count ${brokers} for RabbitMQ specification ${specId}. Allowed: ${allowed.join(", ")}`
      );
    }
  } else if (isSingle && brokers !== 1) {
    throw new CalculatorError("VALIDATION", `Single-node RabbitMQ specification ${specId} requires exactly 1 broker, got ${brokers}`);
  }

  return {
    service: "rabbitmq",
    specId,
    architecture,
    conversionRate,
    storageSpec: "dms.physical.storage.ultra.v2.rabbitmq",
    storageType: "dataInfo_12_",
    allowedBrokers: isSingle ? [1] : [3, 5, 7],
    storageUnit: "detail_19_",
  };
}
