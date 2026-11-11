import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DMS_CONFIG_SOURCE,
  resolveDmsConfig,
  resolveKafkaConfig,
  resolveRabbitmqConfig,
  type DmsConfigSource,
} from "../../src/core/services/dms-config.ts";

describe("DMS Configuration and Topology Resolver", () => {
  // 1. Broker bounds
  describe("broker bounds", () => {
    test("Kafka single-node requires exactly 1 broker", () => {
      const resolved = resolveDmsConfig("kafka", "sa-brazil-1", {
        specId: "kafka.2u4g.single.small",
        brokers: 1,
      });
      expect(resolved.conversionRate).toBe(5);
      expect(resolved.allowedBrokers).toEqual([1]);

      expect(() =>
        resolveDmsConfig("kafka", "sa-brazil-1", {
          specId: "kafka.2u4g.single.small",
          brokers: 3,
        })
      ).toThrow(/requires exactly 1 broker/);

      expect(() =>
        resolveDmsConfig("kafka", "sa-brazil-1", {
          specId: "kafka.2u4g.single",
          brokers: 0,
        })
      ).toThrow(/requires exactly 1 broker/);
    });

    test("Kafka cluster enforces [3, maxNodeNum] integer bounds per specification", () => {
      // c6.2u4g.cluster has maxNodeNum = 30
      const smallValid = resolveDmsConfig("kafka", "sa-brazil-1", {
        specId: "c6.2u4g.cluster",
        brokers: 30,
      });
      expect(smallValid.conversionRate).toBe(7);
      expect(smallValid.allowedBrokers.length).toBe(28); // 3..30 inclusive

      expect(() =>
        resolveDmsConfig("kafka", "sa-brazil-1", {
          specId: "c6.2u4g.cluster",
          brokers: 2,
        })
      ).toThrow(/must be between 3 and 30/);

      expect(() =>
        resolveDmsConfig("kafka", "sa-brazil-1", {
          specId: "c6.2u4g.cluster",
          brokers: 31,
        })
      ).toThrow(/must be between 3 and 30/);

      // c6.8u16g.cluster has maxNodeNum = 50
      const largeValid = resolveDmsConfig("kafka", "la-south-2", {
        specId: "c6.8u16g.cluster",
        brokers: 50,
      });
      expect(largeValid.conversionRate).toBe(27);

      expect(() =>
        resolveDmsConfig("kafka", "la-south-2", {
          specId: "c6.8u16g.cluster",
          brokers: 51,
        })
      ).toThrow(/must be between 3 and 50/);
    });

    test("RabbitMQ 3.8 single-node requires exactly 1 broker", () => {
      const valid = resolveDmsConfig("rabbitmq", "sa-brazil-1", {
        specId: "c6.2u4g.single",
        brokers: 1,
        version: "3.8",
      });
      expect(valid.conversionRate).toBe(7);
      expect(valid.allowedBrokers).toEqual([1]);

      expect(() =>
        resolveDmsConfig("rabbitmq", "sa-brazil-1", {
          specId: "c6.2u4g.single",
          brokers: 3,
          version: "3.8",
        })
      ).toThrow(/requires exactly 1 broker/);
    });

    test("RabbitMQ 3.8 cluster allows exactly [3, 5, 7] brokers", () => {
      for (const brokers of [3, 5, 7]) {
        const resolved = resolveDmsConfig("rabbitmq", "sa-brazil-1", {
          specId: "c6.4u8g.cluster",
          brokers,
          version: "3.8",
        });
        expect(resolved.conversionRate).toBe(14);
      }

      for (const invalid of [1, 2, 4, 6, 8, 9]) {
        expect(() =>
          resolveDmsConfig("rabbitmq", "sa-brazil-1", {
            specId: "c6.4u8g.cluster",
            brokers: invalid,
            version: "3.8",
          })
        ).toThrow(/Allowed: 3, 5, 7/);
      }
    });

    test("RabbitMQ AMQP family (p1 and p2) requires exactly 1 broker (single ECS)", () => {
      // p1 single
      const p1 = resolveDmsConfig("rabbitmq", "sa-brazil-1", {
        specId: "amqp.p1.large.2",
        brokers: 1,
        version: "amqp",
      });
      expect(p1.conversionRate).toBe(7);
      expect(p1.allowedBrokers).toEqual([1]);

      // p2 cluster
      const p2 = resolveDmsConfig("rabbitmq", "sa-brazil-1", {
        specId: "amqp.p2.large.6",
        brokers: 1,
        version: "amqp",
      });
      expect(p2.conversionRate).toBe(21);
      expect(p2.architecture).toBe("cluster");
      expect(p2.allowedBrokers).toEqual([1]);

      // AMQP with >1 broker must fail closed
      expect(() =>
        resolveDmsConfig("rabbitmq", "sa-brazil-1", {
          specId: "amqp.p2.large.6",
          brokers: 3,
          version: "amqp",
        })
      ).toThrow(/RabbitMQ AMQP specification amqp.p2.large.6 requires exactly 1 broker/);
    });
  });

  // 2. Version mismatches
  describe("version mismatches", () => {
    test("rejects AMQP specification paired with version 3.8", () => {
      expect(() =>
        resolveDmsConfig("rabbitmq", "sa-brazil-1", {
          specId: "amqp.p2.large.6",
          brokers: 1,
          version: "3.8",
        })
      ).toThrow(/incompatible with version 3.8/);
    });

    test("rejects 3.8 c6 specification paired with version amqp", () => {
      expect(() =>
        resolveDmsConfig("rabbitmq", "sa-brazil-1", {
          specId: "c6.2u4g.cluster",
          brokers: 3,
          version: "amqp",
        })
      ).toThrow(/incompatible with version amqp/);
    });

    test("rejects unknown RabbitMQ version", () => {
      expect(() =>
        resolveDmsConfig("rabbitmq", "sa-brazil-1", {
          specId: "c6.2u4g.cluster",
          brokers: 3,
          version: "not-a-version",
        })
      ).toThrow(/Unknown RabbitMQ version 'not-a-version'/);
    });
  });

  // 3. Alternate storage
  describe("alternate storage options", () => {
    test("Kafka defaults to ultra.v2 and resolves high.v2 when requested", () => {
      const ultra = resolveDmsConfig("kafka", "sa-brazil-1", {
        specId: "c6.2u4g.cluster",
        brokers: 3,
      });
      expect(ultra.storageChoice).toBe("ultra");
      expect(ultra.storageSpec).toBe("dms.physical.storage.ultra.v2.kafka");
      expect(ultra.storageType).toBe("dataInfo_7_");
      expect(ultra.storageUnit).toBe("detail_9_");

      const high = resolveDmsConfig("kafka", "sa-brazil-1", {
        specId: "c6.2u4g.cluster",
        brokers: 3,
        storageType: "high",
      });
      expect(high.storageChoice).toBe("high");
      expect(high.storageSpec).toBe("dms.physical.storage.high.v2.kafka");
      expect(high.storageType).toBe("dataInfo_6_");
      expect(high.storageUnit).toBe("detail_9_");
    });

    test("RabbitMQ defaults to ultra.v2 and resolves high.v2 when requested", () => {
      const ultra = resolveDmsConfig("rabbitmq", "la-south-2", {
        specId: "c6.2u4g.cluster",
        brokers: 3,
        version: "3.8",
      });
      expect(ultra.storageChoice).toBe("ultra");
      expect(ultra.storageSpec).toBe("dms.physical.storage.ultra.v2.rabbitmq");
      expect(ultra.storageType).toBe("dataInfo_12_");
      expect(ultra.storageUnit).toBe("detail_19_");

      const high = resolveDmsConfig("rabbitmq", "la-south-2", {
        specId: "c6.2u4g.cluster",
        brokers: 3,
        version: "3.8",
        storageType: "high",
      });
      expect(high.storageChoice).toBe("high");
      expect(high.storageSpec).toBe("dms.physical.storage.high.v2.rabbitmq");
      expect(high.storageType).toBe("dataInfo_11_");
      expect(high.storageUnit).toBe("detail_19_");
    });

    test("rejects unoffered storage types", () => {
      expect(() =>
        resolveDmsConfig("kafka", "sa-brazil-1", {
          specId: "c6.2u4g.cluster",
          brokers: 3,
          storageType: "extreme" as any,
        })
      ).toThrow(/Storage type 'extreme' is not supported/);
    });
  });

  // 4. Missing source metadata
  describe("missing source metadata", () => {
    test("rejects unknown Kafka specId without guessing conversion rates", () => {
      expect(() =>
        resolveDmsConfig("kafka", "sa-brazil-1", {
          specId: "kafka.unknown.nonexistent.spec",
          brokers: 3,
        })
      ).toThrow(/missing conversion metadata/);
    });

    test("rejects unknown RabbitMQ specId without guessing conversion rates", () => {
      expect(() =>
        resolveDmsConfig("rabbitmq", "sa-brazil-1", {
          specId: "c6.nonexistent.spec",
          brokers: 3,
        })
      ).toThrow(/missing conversion metadata/);
    });
  });

  // 5. Region mismatch
  describe("region mismatch", () => {
    test("rejects unsupported region for DMS service", () => {
      expect(() =>
        resolveDmsConfig("kafka", "eu-west-101", {
          specId: "c6.2u4g.cluster",
          brokers: 3,
        })
      ).toThrow(/Region 'eu-west-101' is not configured for DMS kafka/);
    });

    test("both LATAM regions are supported with identical 8 Kafka and 27 RabbitMQ catalog specs", () => {
      for (const region of ["sa-brazil-1", "la-south-2"]) {
        const kafkaConfig = resolveDmsConfig("kafka", region, {
          specId: "c6.16u32g.cluster",
          brokers: 5,
        });
        expect(kafkaConfig.conversionRate).toBe(50);

        const rabbitConfig = resolveDmsConfig("rabbitmq", region, {
          specId: "amqp.p2.large.280",
          brokers: 1,
          version: "amqp",
        });
        expect(rabbitConfig.conversionRate).toBe(525);
      }
    });
  });

  // 6. Injected new normalized config row
  describe("injected new normalized config row", () => {
    test("shared resolver consumes injected DmsConfigSource with custom specs and bounds", () => {
      const injectedSource: DmsConfigSource = {
        provenance: "Unit test injected normalized vendor config",
        regions: {
          "custom-region-1": {
            kafka: {
              specs: {
                "c7.custom.kafka.cluster": {
                  specId: "c7.custom.kafka.cluster",
                  architecture: "cluster",
                  conversionRate: 88,
                  minBrokers: 3,
                  maxBrokers: 45,
                },
              },
              storage: {
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
              },
            },
            rabbitmq: {
              specs: {
                "c7.custom.rabbitmq.cluster": {
                  specId: "c7.custom.rabbitmq.cluster",
                  architecture: "cluster",
                  conversionRate: 99,
                  version: "3.8",
                  minBrokers: 3,
                  maxBrokers: 9,
                  allowedBrokers: [3, 5, 7, 9],
                },
              },
              storage: {
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
              },
            },
          },
        },
      };

      // Injected Kafka spec resolves successfully
      const resolvedKafka = resolveDmsConfig(
        "kafka",
        "custom-region-1",
        { specId: "c7.custom.kafka.cluster", brokers: 45 },
        injectedSource
      );
      expect(resolvedKafka.conversionRate).toBe(88);
      expect(resolvedKafka.allowedBrokers.length).toBe(43); // 3..45

      // Exceeding the injected max broker count of 45 fails
      expect(() =>
        resolveDmsConfig(
          "kafka",
          "custom-region-1",
          { specId: "c7.custom.kafka.cluster", brokers: 46 },
          injectedSource
        )
      ).toThrow(/must be between 3 and 45/);

      // Injected RabbitMQ spec resolves
      const resolvedRabbit = resolveDmsConfig(
        "rabbitmq",
        "custom-region-1",
        { specId: "c7.custom.rabbitmq.cluster", brokers: 9, version: "3.8" },
        injectedSource
      );
      expect(resolvedRabbit.conversionRate).toBe(99);
      expect(resolvedRabbit.allowedBrokers).toEqual([3, 5, 7, 9]);

      // Unallowed broker count for injected RabbitMQ spec fails
      expect(() =>
        resolveDmsConfig(
          "rabbitmq",
          "custom-region-1",
          { specId: "c7.custom.rabbitmq.cluster", brokers: 4, version: "3.8" },
          injectedSource
        )
      ).toThrow(/Allowed: 3, 5, 7, 9/);
    });
  });

  // Backward compatibility helpers
  describe("backward compatibility helper functions", () => {
    test("resolveKafkaConfig works without explicit region", () => {
      const res = resolveKafkaConfig("c6.2u4g.cluster", 5);
      expect(res.conversionRate).toBe(7);
      expect(res.region).toBe("sa-brazil-1");
    });

    test("resolveRabbitmqConfig works without explicit region", () => {
      const res = resolveRabbitmqConfig("c6.2u4g.cluster", 5, "3.8");
      expect(res.conversionRate).toBe(7);
      expect(res.region).toBe("sa-brazil-1");
    });
  });
});
