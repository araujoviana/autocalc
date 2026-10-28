import { expect, test } from "bun:test";
import { RegionResolver } from "../../src/core/regions.ts";
import { CalculatorError } from "../../src/core/errors.ts";

test("resolves aliases and detects ambiguous regions", () => {
  const regions = new RegionResolver({ "sa-brazil-1": "LA-Sao Paulo1", "na-mexico-1": "Mexico City1", "la-north-2": "Mexico City2" });
  expect(regions.resolve("São Paulo")).toBe("sa-brazil-1");
  expect(regions.resolve("la-north-2")).toBe("la-north-2");
  expect(() => regions.resolve("Mexico")).toThrow(CalculatorError);
  expect(() => regions.resolve("not-a-region")).toThrow(CalculatorError);
});
