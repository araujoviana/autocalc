import { expect, test } from "bun:test";
import { resolveConfig, profilePaths } from "../../src/core/config.ts";

test("resolves startup options without touching the filesystem", () => {
  expect(resolveConfig({}, {})).toMatchObject({ profile: "default", headed: false, timeout: 60000, cacheTtl: 86400 });
  expect(resolveConfig({ profile: "chosen", headed: true }, { AUTOCALC_PROFILE: "env" }).profile).toBe("chosen");
  expect(resolveConfig({}, { AUTOCALC_PROFILE: "env" }).profile).toBe("env");
});

test("profile paths stay inside configured directories", () => {
  expect(profilePaths("demo", { AUTOCALC_CONFIG: "/tmp/config", AUTOCALC_DATA: "/tmp/data" })).toEqual({ configDir: "/tmp/config", profileDir: "/tmp/data/browser-profile-demo" });
  expect(() => profilePaths("../x", {})).toThrow();
});
