import { describe, expect, test } from "bun:test";
import {
  calculateCoverage,
  EXCLUDED_CONFIGURATIONS,
  EXCLUDED_SERVICES,
  renderCoverage,
  TARGET_REGIONS,
  type CoverageCase,
} from "../support/compat/coverage.ts";

describe("Regional Configuration and Evidence Inventory", () => {
  test("exports target regions sa-brazil-1 and la-south-2", () => {
    expect(TARGET_REGIONS).toEqual(["sa-brazil-1", "la-south-2"]);
  });

  test("exports explicit exclusions for publication-blocked services and out-of-scope items", () => {
    expect(EXCLUDED_SERVICES).toContain("ssa");
    expect(EXCLUDED_SERVICES).toContain("aad");
    expect(EXCLUDED_SERVICES).toContain("cc");
    expect(EXCLUDED_SERVICES).toContain("dbss");
    expect(EXCLUDED_SERVICES).toContain("dsc");
    expect(EXCLUDED_SERVICES).toContain("edgesec");
    expect(EXCLUDED_SERVICES).toContain("esw");
    expect(EXCLUDED_SERVICES).toContain("ga");
    expect(EXCLUDED_SERVICES).toContain("hecs");
    expect(EXCLUDED_SERVICES).toContain("reliability");
    expect(EXCLUDED_SERVICES).toContain("ucs");

    expect(EXCLUDED_CONFIGURATIONS).toContain("windows_guest");
    expect(EXCLUDED_CONFIGURATIONS).toContain("private_nat");
    expect(EXCLUDED_CONFIGURATIONS).toContain("rocketmq");
  });

  test("replay without price verification marks replay passed and publication unverified", () => {
    const cases: CoverageCase[] = [
      {
        region: "sa-brazil-1",
        service: "cce",
        variant: "turbo",
        billing: "ondemand",
        evidence: {
          implemented: true,
          replay: "verified",
          rating: "unverified",
          publication: "unverified",
        },
      },
    ];

    const stats = calculateCoverage(cases);
    expect(stats.byRegion["sa-brazil-1"]!.replayVerified).toBe(1);
    expect(stats.byRegion["sa-brazil-1"]!.publicationVerified).toBe(0);
    expect(stats.byRegion["sa-brazil-1"]!.ratingVerified).toBe(0);

    const rendered = renderCoverage(cases);
    expect(rendered).toContain("sa-brazil-1");
    expect(rendered).toContain("turbo");
    expect(rendered).toContain("verified");
    expect(rendered).toContain("unverified");
  });

  test("independent regional evidence isolates sa-brazil-1 from la-south-2", () => {
    const cases: CoverageCase[] = [
      {
        region: "sa-brazil-1",
        service: "cce",
        variant: "turbo",
        evidence: {
          implemented: true,
          replay: "verified",
          rating: "verified",
          publication: "verified",
        },
      },
      {
        region: "la-south-2",
        service: "cce",
        variant: "turbo",
        evidence: {
          implemented: true,
          replay: "unverified",
          rating: "unverified",
          publication: "unverified",
          reason: "Product not yet verified in Santiago",
        },
      },
    ];

    const stats = calculateCoverage(cases);
    expect(stats.byRegion["sa-brazil-1"]!.publicationVerified).toBe(1);
    expect(stats.byRegion["la-south-2"]!.publicationVerified).toBe(0);
  });

  test("exclusions do not inflate usable coverage denominator or certified count", () => {
    const cases: CoverageCase[] = [
      {
        region: "sa-brazil-1",
        service: "ecs",
        variant: "linux",
        evidence: {
          implemented: true,
          replay: "verified",
          rating: "verified",
          publication: "verified",
        },
      },
      {
        region: "sa-brazil-1",
        service: "ecs",
        variant: "windows_guest",
        excluded: true,
        exclusionReason: "Windows guest OS is explicitly out of scope",
        evidence: {
          implemented: false,
          replay: "excluded",
          rating: "excluded",
          publication: "excluded",
        },
      },
      {
        region: "sa-brazil-1",
        service: "nat",
        variant: "private_nat",
        excluded: true,
        exclusionReason: "Private NAT is explicitly out of scope",
        evidence: {
          implemented: false,
          replay: "excluded",
          rating: "excluded",
          publication: "excluded",
        },
      },
      {
        region: "sa-brazil-1",
        service: "ssa",
        excluded: true,
        exclusionReason: "Publication blocked service",
        evidence: {
          implemented: false,
          replay: "excluded",
          rating: "excluded",
          publication: "excluded",
        },
      },
    ];

    const stats = calculateCoverage(cases);
    expect(stats.byRegion["sa-brazil-1"]!.total).toBe(4);
    expect(stats.byRegion["sa-brazil-1"]!.scoped).toBe(1);
    expect(stats.byRegion["sa-brazil-1"]!.excluded).toBe(3);
    expect(stats.byRegion["sa-brazil-1"]!.publicationVerified).toBe(1);

    const rendered = renderCoverage(cases);
    expect(rendered).toContain("Excluded");
    expect(rendered).toContain("Windows guest OS");
  });

  test("upstream reset records environment blocker without certifying or claiming regional unavailability", () => {
    const cases: CoverageCase[] = [
      {
        region: "sa-brazil-1",
        service: "cce",
        variant: "turbo",
        evidence: {
          implemented: true,
          replay: "blocked",
          rating: "blocked",
          publication: "blocked",
          blocker: "ECONNRESET during transport probe",
        },
      },
    ];

    const stats = calculateCoverage(cases);
    expect(stats.byRegion["sa-brazil-1"]!.blocked).toBe(1);
    expect(stats.byRegion["sa-brazil-1"]!.unavailable).toBe(0);
    expect(stats.byRegion["sa-brazil-1"]!.publicationVerified).toBe(0);

    const rendered = renderCoverage(cases);
    expect(rendered).toContain("blocked");
    expect(rendered).toContain("ECONNRESET");
  });
});
