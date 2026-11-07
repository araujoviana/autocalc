/** Anti-Splitting Enforcement for Fixed-Base Cost Services.
 * Enforces the architectural invariant: resources with baseline fixed costs
 * (CCE clusters, NAT gateways, ELBs) must NEVER be split across multiple cards,
 * because splitting duplicates vendor base charges. */
import { CalculatorError } from "../errors.ts";

/** Services that carry fixed base management/instance fees. Splitting duplicate costs. */
export const FIXED_BASE_COST_SERVICES = new Set<string>([
  "cce", // CCE Cluster management fee
  "nat", // NAT Gateway instance base hourly charge
  "elb", // ELB load balancer instance base charge
  "dc",  // Direct Connect physical port base fee
  "dline", // Direct Connect port base fee
  "vpn", // VPN Gateway base hourly fee
]);

/** OBS usage factors that use marginal tiered pricing brackets per card (e.g., 0-10 TB, 10-50 TB).
 * Splitting these across multiple cards resets each card to Tier 1, distorting total price. */
export const TIERED_OBS_FACTORS = new Set<string>([
  "download.external",
  "download_warm.external",
  "download_cold.external",
  "download.cdn",
]);

/** Returns true if a service incurs a fixed baseline fee that makes multi-card splitting cost-distorting. */
export function isFixedBaseCostService(service: string): boolean {
  return FIXED_BASE_COST_SERVICES.has(service.toLowerCase().trim());
}

/** Returns true if an OBS usage factor is priced using per-card marginal tier brackets. */
export function isTieredObsFactor(factor: string): boolean {
  return TIERED_OBS_FACTORS.has(factor.trim());
}

/** Asserts that a resource is eligible for splitting. Throws an error for fixed-base cost services. */
export function assertCanSplitResource(service: string, resourceId: string, reason = "card limit"): void {
  const normalized = service.toLowerCase().trim();
  if (isFixedBaseCostService(normalized)) {
    throw new CalculatorError(
      "VALIDATION",
      `Anti-splitting violation: Service '${normalized}' (resource '${resourceId}') carries a fixed baseline cost and cannot be split across multiple cards for ${reason} without duplicating vendor baseline fees.`
    );
  }
}

/** Asserts that an OBS usage factor is eligible for splitting across cards. Throws for tiered factors. */
export function assertCanSplitObsFactor(factor: string, resourceId: string): void {
  if (isTieredObsFactor(factor)) {
    throw new CalculatorError(
      "VALIDATION",
      `Tiered pricing violation: OBS factor '${factor}' (resource '${resourceId}') uses marginal tier brackets per card and cannot be split across multiple cards (> 102,400 GB) without distorting tier pricing.`
    );
  }
}
