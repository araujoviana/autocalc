/** Vendor Circuit Breaker and Known-Defect Quarantine.
 * Provides 4-tier degradation (FULL_GATE_VERIFIED -> RATING_VERIFIED_EDIT_SKIPPED ->
 * CACHED_CATALOG_ESTIMATE -> EXPORT_ONLY) and catalog anomaly detection. */
import type { DegradationTier } from "../types.ts";

export type { DegradationTier };

export interface KnownDefectSignature {
  service: string;
  billing?: string | undefined;
  defectId: string;
  description: string;
  recommendedTier: DegradationTier;
  advisory: string;
}

export const KNOWN_VENDOR_DEFECTS: KnownDefectSignature[] = [
  {
    service: "kafka",
    billing: "yearly",
    defectId: "GH-6-KAFKA-YEARLY-EDIT",
    description: "DMS Kafka yearly cards re-price on Edit with 'No data matched' error due to vendor SPA catalog key mismatch.",
    recommendedTier: "RATING_VERIFIED_EDIT_SKIPPED",
    advisory: "Vendor calculator SPA re-prices Kafka yearly cards on Edit. Official CBC rating API price was verified and preserved.",
  },
  {
    service: "obs",
    billing: "ondemand",
    defectId: "GH-2-OBS-STORAGE-EDIT-DROP",
    description: "Pay-per-use OBS cards reset storage line to 0 on Edit when storageType_switch momentarily clears pending state.",
    recommendedTier: "RATING_VERIFIED_EDIT_SKIPPED",
    advisory: "Vendor calculator SPA clears OBS storage line on Edit. Official CBC rating API price was verified and preserved.",
  },
];

/** Matches a resource configuration against known upstream vendor SPA defects. */
export function lookupKnownDefect(service: string, billing: string): KnownDefectSignature | undefined {
  const normService = service.toLowerCase().trim();
  const normBilling = billing.toLowerCase().trim();

  return KNOWN_VENDOR_DEFECTS.find(
    (d) => d.service === normService && (!d.billing || d.billing === normBilling)
  );
}

/** Determines the appropriate execution tier for a card based on vendor stability. */
export function resolveExecutionTier(service: string, billing: string, allowEditCheck = true): {
  tier: DegradationTier;
  defect?: KnownDefectSignature | undefined;
} {
  const defect = lookupKnownDefect(service, billing);
  if (defect) {
    return {
      tier: defect.recommendedTier,
      defect,
    };
  }

  if (allowEditCheck) {
    return { tier: "FULL_GATE_VERIFIED" };
  }

  return { tier: "RATING_VERIFIED_EDIT_SKIPPED" };
}

export interface AnomalyWarning {
  resourceId: string;
  service: string;
  yearlyAmount: number;
  monthlyAmount: number;
  ratio: number;
  warning: string;
}

/** Detects catalog pricing anomalies where a yearly package is priced higher than 11.5x monthly. */
export function detectCatalogPricingAnomalies(
  resources: Array<{ id: string; service: string; yearlyAmount?: number | undefined; monthlyAmount?: number | undefined }>
): AnomalyWarning[] {
  const anomalies: AnomalyWarning[] = [];

  for (const res of resources) {
    if (res.yearlyAmount !== undefined && res.monthlyAmount !== undefined && res.monthlyAmount > 0) {
      const ratio = res.yearlyAmount / res.monthlyAmount;
      if (ratio > 11.5) {
        anomalies.push({
          resourceId: res.id,
          service: res.service,
          yearlyAmount: res.yearlyAmount,
          monthlyAmount: res.monthlyAmount,
          ratio,
          warning: `Catalog anomaly: ${res.service} yearly price ($${res.yearlyAmount.toFixed(2)}) is ${ratio.toFixed(1)}x monthly price ($${res.monthlyAmount.toFixed(2)}). Upstream catalog rates higher than monthly. Consider monthly billing.`,
        });
      }
    }
  }

  return anomalies;
}
