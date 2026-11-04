import { expect, test } from "bun:test";
import { bundleVersion } from "../../scripts/bundle-args.ts";

test("bundle fetch accepts the legacy --version option and positional shorthand", () => {
  expect(bundleVersion([])).toBeUndefined();
  expect(bundleVersion(["--version", "11.4.201"])).toBe("11.4.201");
  expect(bundleVersion(["11.4.201"])).toBe("11.4.201");
  for (const args of [["--version"], ["--version", "../invalid"], ["1.2", "extra"]]) expect(() => bundleVersion(args)).toThrow();
});
