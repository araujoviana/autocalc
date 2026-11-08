import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig, profilePaths } from "../../src/core/config.ts";

test("resolves startup options without touching the filesystem", () => {
  expect(resolveConfig({}, {})).toMatchObject({ profile: "default", headed: false, timeout: 60000, cacheTtl: 86400 });
  expect(resolveConfig({ profile: "chosen", headed: true }, { AUTOCALC_PROFILE: "env" }).profile).toBe("chosen");
  expect(resolveConfig({}, { AUTOCALC_PROFILE: "env" }).profile).toBe("env");
});

test("profile paths stay inside configured directories", () => {
  const configDir = join(tmpdir(), "config");
  const dataDir = join(tmpdir(), "data");
  expect(profilePaths("demo", { AUTOCALC_CONFIG: configDir, AUTOCALC_DATA: dataDir })).toEqual({
    configDir,
    profileDir: join(dataDir, "browser-profile-demo"),
  });
  expect(() => profilePaths("../x", {})).toThrow();
});
