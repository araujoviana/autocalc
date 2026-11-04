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
  "vpn", // VPN Gateway base hourly fee
]);

/** Returns true if a service incurs a fixed baseline fee that makes multi-card splitting cost-distorting. */
export function isFixedBaseCostService(service: string): boolean {
  return FIXED_BASE_COST_SERVICES.has(service.toLowerCase().trim());
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
