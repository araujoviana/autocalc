import { describe, expect, it } from "bun:test";
import {
  measureCompactBytes,
  optimizeCardPayload,
  partitionResources,
  sanitizeTitle,
  validateListTitle,
  MAX_TITLE_LENGTH,
} from "../../../src/core/compiler/wire.ts";
import { CalculatorError } from "../../../src/core/errors.ts";
import type { CanonicalResourceIR } from "../../../src/core/compiler/ir.ts";

describe("Wire Optimization and Payload Budgeter", () => {
  describe("Measurement and Title Sanitization", () => {
    it("measures compact JSON UTF-8 byte size accurately", () => {
      const obj = { id: "test", count: 123, text: "São Paulo" };
      const bytes = measureCompactBytes(obj);
      expect(bytes).toBe(new TextEncoder().encode(JSON.stringify(obj)).length);
    });

    it("sanitizes titles by stripping autocalc watermarks and enforcing 55 char limit", () => {
      expect(sanitizeTitle("autocalc - Acme Production Cluster")).toBe("Acme Production Cluster");
      expect(sanitizeTitle("[autocalc] Production Quote")).toBe("Production Quote");
      expect(sanitizeTitle("Quote by autocalc: DMZ")).toBe("Quote by  DMZ");

      const longTitle = "A".repeat(80);
      const cleaned = sanitizeTitle(longTitle);
      expect(cleaned.length).toBe(MAX_TITLE_LENGTH);
    });

    it("validates list titles against length limits and watermark bans", () => {
      expect(() => validateListTitle("autocalc - My List")).toThrow(CalculatorError);
      expect(() => validateListTitle("A".repeat(60))).toThrow(CalculatorError);
      expect(() => validateListTitle("Clean User Title")).not.toThrow();
    });
  });

  describe("Partitioning", () => {
    it("partitions large resources into correlated shards respecting card limits", () => {
      const resources: CanonicalResourceIR[] = Array.from({ length: 25 }, (_, i) => ({
        id: `res-${i}`,
        service: "ecs",
        region: "sa-brazil-1",
        availability: "single-az",
        billing: "monthly",
        quantity: 1,
        physicalCards: [
          {
            cardIndex: i,
            cardId: `res-${i}-0`,
            title: `res-${i}`,
            options: {},
            quantity: 1,
            unitAmount: 10,
            totalAmount: 10,
          },
        ],
      }));

      // Set maxCards = 10 to force 3 partitions (10, 10, 5)
      const shards = partitionResources(resources, "Acme - Prod", 10);
      expect(shards.length).toBe(3);
      expect(shards[0]!.title).toBe("Acme - Prod - Part 1");
      expect(shards[0]!.cardCount).toBe(10);
      expect(shards[1]!.title).toBe("Acme - Prod - Part 2");
      expect(shards[1]!.cardCount).toBe(10);
      expect(shards[2]!.title).toBe("Acme - Prod - Part 3");
      expect(shards[2]!.cardCount).toBe(5);
    });
  });

  describe("Lean Card Payload Optimization", () => {
    it("prunes foreign bakPlanList entries from card payloads", () => {
      const rawCard = {
        cardId: "obs-1",
        productAllInfos: [
          {
            usageFactor: "size_standard",
            bakPlanList: [
              { usageFactor: "size_standard", planId: "p1" },
              { usageFactor: "download_traffic", planId: "p2" },
              { usageFactor: "api_requests", planId: "p3" },
            ],
          },
        ],
      };

      const optimized = optimizeCardPayload(rawCard);
      const plans = optimized.productAllInfos[0].bakPlanList;
      expect(plans.length).toBe(1);
      expect(plans[0].usageFactor).toBe("size_standard");
    });
  });
});
