/** Duration and Financial Horizon Normalizer.
 * Normalizes on-demand and pay-per-use resources according to the quote horizon (1m vs 1y).
 * Bridges the gap between Huawei Cloud's discrete billing units (h, d, mo) and evaluation horizons. */
import type { QuoteHorizon } from "./ast.ts";
import type { ExpandedResource } from "./expander.ts";

export interface NormalizedResource extends ExpandedResource {
  horizon: {
    duration: "1m" | "1y";
    effectiveHours: number;
    effectiveDays: number;
    effectiveMonths: number;
    metricMultiplier: number;
  };
}

export function normalizeHorizon(
  resources: ExpandedResource[],
  horizonConfig?: QuoteHorizon
): NormalizedResource[] {
  const duration = horizonConfig?.duration ?? "1m";
  const isYearlyHorizon = duration === "1y";

  return resources.map((res) => {
    const isPayPerUse = res.billing === "ondemand" || res.billing === "pay-per-use";

    let effectiveHours = 730;
    let effectiveDays = 30.416;
    let effectiveMonths = 1;
    let metricMultiplier = 1;

    if (isYearlyHorizon) {
      if (isPayPerUse) {
        effectiveHours = 8760;
        effectiveDays = 365;
        effectiveMonths = 12;
        metricMultiplier = 12; // E.g., KMS API calls per month x 12
      } else if (res.billing === "monthly") {
        // Monthly packages evaluated over 1 year
        effectiveMonths = 12;
        effectiveHours = 8760;
        effectiveDays = 365;
        metricMultiplier = 12;
      } else if (res.billing === "yearly") {
        // Yearly package evaluated over 1 year
        effectiveMonths = 12;
        effectiveHours = 8760;
        effectiveDays = 365;
        metricMultiplier = 1;
      }
    } else {
      // 1-month horizon
      effectiveHours = 730;
      effectiveDays = 30.416;
      effectiveMonths = 1;
      metricMultiplier = 1;
    }

    return {
      ...res,
      horizon: {
        duration,
        effectiveHours,
        effectiveDays,
        effectiveMonths,
        metricMultiplier,
      },
    };
  });
}
