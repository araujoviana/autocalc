import { describe, expect, it } from "bun:test";
import { normalizeHorizon } from "../../../src/core/compiler/horizon.ts";
import type { ExpandedResource } from "../../../src/core/compiler/expander.ts";

describe("Duration and Horizon Normalizer", () => {
  const sampleResources: ExpandedResource[] = [
    {
      id: "res-ondemand-obs",
      service: "obs",
      region: "sa-brazil-1",
      billing: "ondemand",
      availability: "single-az",
      quantity: 1,
    },
    {
      id: "res-monthly-ecs",
      service: "ecs",
      region: "sa-brazil-1",
      billing: "monthly",
      availability: "single-az",
      quantity: 2,
    },
    {
      id: "res-yearly-rds",
      service: "rds",
      region: "sa-brazil-1",
      billing: "yearly",
      availability: "single-az",
      quantity: 1,
    },
  ];

  it("normalizes to 1-month evaluation baseline when horizon is 1m or undefined", () => {
    const norm = normalizeHorizon(sampleResources, { duration: "1m" });
    expect(norm[0]!.horizon.duration).toBe("1m");
    expect(norm[0]!.horizon.effectiveHours).toBe(730);
    expect(norm[0]!.horizon.effectiveMonths).toBe(1);
    expect(norm[0]!.horizon.metricMultiplier).toBe(1);

    expect(norm[1]!.horizon.effectiveMonths).toBe(1);
    expect(norm[2]!.horizon.effectiveMonths).toBe(1);
  });

  it("normalizes pay-per-use and monthly resources across a 1-year horizon", () => {
    const norm = normalizeHorizon(sampleResources, { duration: "1y" });

    // On-demand OBS scales to 8,760h / 365d / 12 months with 12x metric multiplier
    const obs = norm[0]!;
    expect(obs.horizon.duration).toBe("1y");
    expect(obs.horizon.effectiveHours).toBe(8760);
    expect(obs.horizon.effectiveDays).toBe(365);
    expect(obs.horizon.effectiveMonths).toBe(12);
    expect(obs.horizon.metricMultiplier).toBe(12);

    // Monthly ECS evaluated across 1 year has 12 effective months
    const ecs = norm[1]!;
    expect(ecs.horizon.effectiveMonths).toBe(12);
    expect(ecs.horizon.metricMultiplier).toBe(12);

    // Yearly RDS has 1 package unit over the 12 months
    const rds = norm[2]!;
    expect(rds.horizon.effectiveMonths).toBe(12);
    expect(rds.horizon.metricMultiplier).toBe(1);
  });
});
