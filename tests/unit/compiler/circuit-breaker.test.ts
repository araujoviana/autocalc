import { describe, expect, it } from "bun:test";
import {
  detectCatalogPricingAnomalies,
  lookupKnownDefect,
  resolveExecutionTier,
} from "../../../src/core/compiler/circuit-breaker.ts";

describe("Vendor Circuit Breaker and Anomaly Guard", () => {
  describe("Known Defect Table", () => {
    it("identifies known vendor SPA defects and routes them to RATING_VERIFIED_EDIT_SKIPPED", () => {
      const kafkaDefect = lookupKnownDefect("kafka", "yearly");
      expect(kafkaDefect).toBeDefined();
      expect(kafkaDefect?.defectId).toBe("GH-6-KAFKA-YEARLY-EDIT");
      expect(kafkaDefect?.recommendedTier).toBe("RATING_VERIFIED_EDIT_SKIPPED");

      const obsDefect = lookupKnownDefect("obs", "ondemand");
      expect(obsDefect).toBeDefined();
      expect(obsDefect?.defectId).toBe("GH-2-OBS-STORAGE-EDIT-DROP");

      const res = resolveExecutionTier("kafka", "yearly");
      expect(res.tier).toBe("RATING_VERIFIED_EDIT_SKIPPED");
      expect(res.defect).toBeDefined();
    });

    it("routes normal stable services to FULL_GATE_VERIFIED", () => {
      const ecsRes = resolveExecutionTier("ecs", "monthly");
      expect(ecsRes.tier).toBe("FULL_GATE_VERIFIED");
      expect(ecsRes.defect).toBeUndefined();

      const rdsRes = resolveExecutionTier("rds", "yearly");
      expect(rdsRes.tier).toBe("FULL_GATE_VERIFIED");
    });
  });

  describe("Catalog Pricing Anomaly Guard", () => {
    it("flags upstream catalog anomalies where yearly price is > 11.5x monthly", () => {
      const resources = [
        {
          id: "normal-ecs",
          service: "ecs",
          monthlyAmount: 100,
          yearlyAmount: 1000, // 10x monthly -> normal annual discount
        },
        {
          id: "anomalous-redis-ha",
          service: "redis",
          monthlyAmount: 198.56,
          yearlyAmount: 2912.34, // 14.7x monthly! Upstream SKU anomaly from GH #4
        },
      ];

      const anomalies = detectCatalogPricingAnomalies(resources);
      expect(anomalies.length).toBe(1);
      expect(anomalies[0]?.resourceId).toBe("anomalous-redis-ha");
      expect(anomalies[0]?.ratio).toBeCloseTo(14.7, 1);
      expect(anomalies[0]?.warning).toContain("Catalog anomaly");
      expect(anomalies[0]?.warning).toContain("rates higher than monthly");
    });
  });
});
