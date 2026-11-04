import { describe, expect, it } from "bun:test";
import {
  assertCanSplitResource,
  isFixedBaseCostService,
} from "../../../src/core/compiler/anti-split.ts";
import { CalculatorError } from "../../../src/core/errors.ts";

describe("Anti-Splitting Invariant Enforcement", () => {
  it("identifies services carrying fixed baseline costs", () => {
    expect(isFixedBaseCostService("cce")).toBe(true);
    expect(isFixedBaseCostService("nat")).toBe(true);
    expect(isFixedBaseCostService("elb")).toBe(true);
    expect(isFixedBaseCostService("dc")).toBe(true);
    expect(isFixedBaseCostService("vpn")).toBe(true);

    expect(isFixedBaseCostService("ecs")).toBe(false);
    expect(isFixedBaseCostService("obs")).toBe(false);
    expect(isFixedBaseCostService("dew")).toBe(false);
  });

  it("blocks splitting attempts on fixed-base cost resources with clear error", () => {
    expect(() => assertCanSplitResource("cce", "prod-cluster")).toThrow(CalculatorError);
    expect(() => assertCanSplitResource("nat", "vpc-nat")).toThrow(CalculatorError);
    expect(() => assertCanSplitResource("elb", "public-lb")).toThrow(CalculatorError);

    try {
      assertCanSplitResource("cce", "k8s-prod");
    } catch (e: any) {
      expect(e.message).toContain("Anti-splitting violation");
      expect(e.message).toContain("duplicating vendor baseline fees");
    }
  });

  it("permits splitting on purely variable metric services", () => {
    expect(() => assertCanSplitResource("obs", "bulk-storage")).not.toThrow();
    expect(() => assertCanSplitResource("dew", "kms-key-ops")).not.toThrow();
    expect(() => assertCanSplitResource("ecs", "worker-nodes")).not.toThrow();
  });
});
