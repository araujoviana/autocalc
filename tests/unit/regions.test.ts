import { expect, test } from "bun:test";
import { RegionResolver, formatRegion, regionLocation } from "../../src/core/regions.ts";
import { CalculatorError } from "../../src/core/errors.ts";

test("resolves aliases and detects ambiguous regions", () => {
  const regions = new RegionResolver({ "sa-brazil-1": "LA-Sao Paulo1", "na-mexico-1": "Mexico City1", "la-north-2": "Mexico City2" });
  expect(regions.resolve("São Paulo")).toBe("sa-brazil-1");
  expect(regions.resolve("São Paulo, Brazil")).toBe("sa-brazil-1");
  expect(regions.resolve("la-north-2")).toBe("la-north-2");
  expect(() => regions.resolve("Mexico")).toThrow(CalculatorError);
  expect(() => regions.resolve("not-a-region")).toThrow(CalculatorError);
});

test("differentiates region ID, geographic location, and portal label", () => {
  const regions = new RegionResolver({ "sa-brazil-1": "LA-Sao Paulo1", "la-south-2": "LA-Santiago" });
  expect(regionLocation("sa-brazil-1")).toBe("São Paulo, Brazil");
  expect(formatRegion("sa-brazil-1")).toBe("sa-brazil-1 (São Paulo, Brazil)");
  expect(regions.info("sa-brazil-1")).toEqual({
    id: "sa-brazil-1",
    location: "São Paulo, Brazil",
    portalName: "LA-Sao Paulo1",
  });
});
