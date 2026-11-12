import { describe, expect, it } from "bun:test";
import { normalizeResourceToCard, normalizeResourceToCards } from "../../../src/core/compiler/normalizer.ts";
import type { NormalizedResource } from "../../../src/core/compiler/horizon.ts";

function makeResource(partial: Partial<NormalizedResource> & { id: string; service: string }): NormalizedResource {
  return {
    id: partial.id,
    service: partial.service,
    region: partial.region ?? "sa-brazil-1",
    billing: partial.billing ?? "ondemand",
    availability: partial.availability ?? "single-az",
    quantity: partial.quantity ?? 1,
    horizon: partial.horizon ?? { duration: "1m", effectiveHours: 730, effectiveDays: 30, effectiveMonths: 1, metricMultiplier: 1 },
    needs: partial.needs ?? {},
    options: partial.options ?? {},
    spec: partial.spec,
  };
}

describe("Compiler Normalizer Expansion and Scoped IaaS Mapping", () => {
  describe("1. Quantity Expansion for Single-Quantity and CCE Resources", () => {
    it("expands ELB with quantity > 1 into individual cards with quantity 1", () => {
      const res = makeResource({
        id: "core-elb",
        service: "elb",
        quantity: 3,
        options: { type: "shared" },
      });
      const cards = normalizeResourceToCards(res);
      expect(cards.length).toBe(3);
      expect(cards[0]!.id).toBe("core-elb-1");
      expect(cards[0]!.quantity).toBe(1);
      expect(cards[1]!.id).toBe("core-elb-2");
      expect(cards[1]!.quantity).toBe(1);
      expect(cards[2]!.id).toBe("core-elb-3");
      expect(cards[2]!.quantity).toBe(1);
    });

    it("expands on-demand CCE cluster with quantity > 1 into individual cards", () => {
      const res = makeResource({
        id: "k8s-cluster",
        service: "cce",
        billing: "ondemand",
        quantity: 2,
        options: { cluster_type: "turbo", ha: true, scale: "medium" },
      });
      const cards = normalizeResourceToCards(res);
      expect(cards.length).toBe(2);
      expect(cards[0]!.id).toBe("k8s-cluster-1");
      expect(cards[0]!.quantity).toBe(1);
      expect(cards[0]!.options.cluster_type).toBe("turbo");
      expect(cards[1]!.id).toBe("k8s-cluster-2");
      expect(cards[1]!.quantity).toBe(1);
    });

    it("preserves monthly CCE cluster quantity without splitting into cards", () => {
      const res = makeResource({
        id: "monthly-cce",
        service: "cce",
        billing: "monthly",
        quantity: 2,
        options: { cluster_type: "standard", ha: true, scale: "small" },
      });
      const cards = normalizeResourceToCards(res);
      expect(cards.length).toBe(1);
      expect(cards[0]!.id).toBe("monthly-cce");
      expect(cards[0]!.quantity).toBe(2);
    });

    it("preserves standard ECS resource quantity without splitting", () => {
      const res = makeResource({
        id: "web-fleet",
        service: "ecs",
        quantity: 5,
        needs: { vcpus: 4, memory_gb: 16 },
      });
      const cards = normalizeResourceToCards(res);
      expect(cards.length).toBe(1);
      expect(cards[0]!.id).toBe("web-fleet");
      expect(cards[0]!.quantity).toBe(5);
    });
  });

  describe("2. Dedicated and Shared ELB Normalization", () => {
    it("normalizes dedicated ELB with flavor and LCU options", () => {
      const res = makeResource({
        id: "prod-elb",
        service: "elb",
        options: {
          type: "dedicated",
          flavor: "elbv3.professional",
          l4_lcu: 4,
          l7_lcu: 8,
        },
      });
      const card = normalizeResourceToCard(res);
      expect(card.service).toBe("elb");
      expect(card.spec).toBe("elbv3.professional");
      expect(card.options.type).toBe("dedicated");
      expect(card.options.flavor).toBe("elbv3.professional");
      expect(card.options.l4_lcu).toBe(4);
      expect(card.options.l7_lcu).toBe(8);
      expect(card.quantity).toBe(1);
    });

    it("infers dedicated ELB from spec prefix and supports general lcu alias", () => {
      const res = makeResource({
        id: "prod-elb-spec",
        service: "elb",
        spec: "elbv3.basic.1az",
        options: {
          lcu: 2,
        },
      });
      const card = normalizeResourceToCard(res);
      expect(card.options.type).toBe("dedicated");
      expect(card.spec).toBe("elbv3.basic.1az");
      expect(card.options.l4_lcu).toBe(2);
    });

    it("normalizes shared ELB with public IP count and default spec", () => {
      const res = makeResource({
        id: "shared-elb",
        service: "elb",
        options: {
          type: "shared",
          public_ip_count: 1,
        },
      });
      const card = normalizeResourceToCard(res);
      expect(card.options.type).toBe("shared");
      expect(card.spec).toBe("elbv2.basic.default");
      expect(card.options.public_ip_count).toBe(1);
    });
  });

  describe("3. EIP Bandwidth, Shared Bandwidth, and Traffic Normalization", () => {
    it("normalizes dedicated bandwidth EIP", () => {
      const res = makeResource({
        id: "public-ip-1",
        service: "eip",
        billing: "monthly",
        options: {
          bandwidth: "10 Mbit/s",
          share_type: "dedicated",
        },
      });
      const card = normalizeResourceToCard(res);
      expect(card.service).toBe("eip");
      expect(card.spec).toBe("19_bgp");
      expect(card.billing).toBe("monthly");
      expect(card.options.billed_by).toBe("bandwidth");
      expect(card.options.share_type).toBe("dedicated");
      expect(card.options.bandwidth_mbps).toBe(10);
      expect(card.options.ip_quantity).toBe(1);
    });

    it("normalizes shared bandwidth EIP with 19_share spec", () => {
      const res = makeResource({
        id: "shared-ip-1",
        service: "eip",
        billing: "ondemand",
        options: {
          bandwidth: "50 Mbit/s",
          share_type: "shared",
        },
      });
      const card = normalizeResourceToCard(res);
      expect(card.service).toBe("eip");
      expect(card.spec).toBe("19_share");
      expect(card.options.billed_by).toBe("bandwidth");
      expect(card.options.share_type).toBe("shared");
      expect(card.options.bandwidth_mbps).toBe(50);
    });

    it("normalizes traffic-billed EIP with ondemand billing and 12_bgp spec", () => {
      const res = makeResource({
        id: "traffic-ip",
        service: "eip",
        billing: "monthly", // should force to ondemand for traffic
        options: {
          traffic: "250 GB",
          ip_reservation: true,
        },
      });
      const card = normalizeResourceToCard(res);
      expect(card.service).toBe("eip");
      expect(card.spec).toBe("12_bgp");
      expect(card.billing).toBe("ondemand");
      expect(card.options.billed_by).toBe("traffic");
      expect(card.options.traffic_gb).toBe(250);
      expect(card.options.ip_reservation).toBe(true);
    });

    it("preserves explicit multi-IP count on single card", () => {
      const res = makeResource({
        id: "ip-pool",
        service: "eip",
        options: {
          bandwidth: "20 Mbit/s",
          ip_quantity: 4,
        },
      });
      const card = normalizeResourceToCard(res);
      expect(card.options.ip_quantity).toBe(4);
    });
  });

  describe("4. DMS Kafka and RabbitMQ Declarative Normalization", () => {
    it("preserves explicit Kafka single-node spec with requested brokers 3 without substituting 1", () => {
      const res = makeResource({
        id: "kafka-explicit-invalid",
        service: "kafka",
        options: {
          spec_id: "kafka.2u4g.single.small",
          brokers: 3,
        },
      });
      const card = normalizeResourceToCard(res);
      expect(card.options.spec_id).toBe("kafka.2u4g.single.small");
      expect(card.options.brokers).toBe(3);
    });

    it("preserves explicit RabbitMQ AMQP spec with requested brokers 3 without substituting 1", () => {
      const res = makeResource({
        id: "rabbit-amqp-invalid",
        service: "rabbitmq",
        options: {
          spec_id: "amqp.p2.large.6",
          version: "amqp",
          brokers: 3,
        },
      });
      const card = normalizeResourceToCard(res);
      expect(card.options.spec_id).toBe("amqp.p2.large.6");
      expect(card.options.brokers).toBe(3);
      expect(card.options.version).toBe("amqp");
    });

    it("preserves explicit RabbitMQ c6 cluster with requested brokers 4 without substituting 3", () => {
      const res = makeResource({
        id: "rabbit-c6-invalid-brokers",
        service: "rabbitmq",
        options: {
          spec_id: "c6.2u4g.cluster",
          version: "3.8",
          brokers: 4,
        },
      });
      const card = normalizeResourceToCard(res);
      expect(card.options.spec_id).toBe("c6.2u4g.cluster");
      expect(card.options.brokers).toBe(4);
    });

    it("preserves explicit unknown spec_id without silently replacing with arbitrary known default", () => {
      const res = makeResource({
        id: "kafka-unknown-spec",
        service: "kafka",
        options: {
          spec_id: "unknown-explicit-spec",
          brokers: 3,
        },
      });
      const card = normalizeResourceToCard(res);
      expect(card.options.spec_id).toBe("unknown-explicit-spec");
      expect(card.options.brokers).toBe(3);
    });

    it("uses heuristic selection when specification and broker inputs are omitted", () => {
      const kafkaDefault = normalizeResourceToCard(makeResource({ id: "k-def", service: "kafka" }));
      expect(kafkaDefault.options.spec_id).toBe("kafka.2u4g.single.small");
      expect(kafkaDefault.options.brokers).toBe(1);

      const rabbitDefault = normalizeResourceToCard(makeResource({ id: "r-def", service: "rabbitmq" }));
      expect(rabbitDefault.options.spec_id).toBe("c6.2u4g.single");
      expect(rabbitDefault.options.brokers).toBe(1);

      const kafkaCluster = normalizeResourceToCard(makeResource({ id: "k-cluster", service: "kafka", availability: "multi-az" }));
      expect(kafkaCluster.options.spec_id).toBe("c6.2u4g.cluster");
      expect(kafkaCluster.options.brokers).toBe(3);
    });

    it("respects flavor, spec, broker_count and nodes aliases", () => {
      const resKafka = makeResource({
        id: "k-alias",
        service: "kafka",
        options: {
          flavor: "c6.4u8g.cluster",
          broker_count: 5,
        },
      });
      const cardKafka = normalizeResourceToCard(resKafka);
      expect(cardKafka.options.spec_id).toBe("c6.4u8g.cluster");
      expect(cardKafka.options.brokers).toBe(5);

      const resRabbit = makeResource({
        id: "r-alias",
        service: "rabbitmq",
        options: {
          spec: "c6.4u8g.cluster",
          nodes: 5,
        },
      });
      const cardRabbit = normalizeResourceToCard(resRabbit);
      expect(cardRabbit.options.spec_id).toBe("c6.4u8g.cluster");
      expect(cardRabbit.options.brokers).toBe(5);
    });
  });

  describe("5. RDS single vs HA under the multi-az default", () => {
    const rds = (options: Record<string, unknown>, availability: "multi-az" | "single-az" = "multi-az") =>
      normalizeResourceToCard(makeResource({ id: "db", service: "rds", availability, needs: { engine: "mysql", vcpus: 2, memory: "4 GiB" }, options }));
    it("keeps the multi-az default as .ha when no type is given", () => {
      expect(rds({}).spec).toBe("rds.mysql.n1.large.2.ha");
    });
    it("lets explicit type: single override the multi-az default", () => {
      expect(rds({ type: "single" }).spec).toBe("rds.mysql.n1.large.2");
      expect(rds({ topology: "single" }).spec).toBe("rds.mysql.n1.large.2");
    });
    it("lets explicit primary-standby force .ha under single-az", () => {
      expect(rds({ type: "primary-standby" }, "single-az").spec).toBe("rds.mysql.n1.large.2.ha");
    });
    it("rejects unknown type values", () => {
      expect(() => rds({ type: "bogus" })).toThrow(/unknown RDS options\.type 'bogus'/);
    });
  });
});
