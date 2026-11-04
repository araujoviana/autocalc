/** Frontend-version warnings: same, different and unknown versions (`tests/test_frontend.py`). */

import { expect, test } from "bun:test";
import * as frontend from "../../src/core/frontend.ts";
import { VERIFIED_VERSIONS } from "../../src/core/frontend.ts";

test("same_version_is_quiet", () => {
  const v = VERIFIED_VERSIONS["ecs"];
  expect(frontend.warnings(["ecs"], v)).toEqual([]);
});

test("different_version_names_service_and_both_versions", () => {
  const notes = frontend.warnings(["ecs", "ecs"], "99.0.0");
  expect(notes).toHaveLength(1);
  const note = notes[0]!;
  expect(note).toContain("ecs");
  expect(note).toContain(VERIFIED_VERSIONS["ecs"]!);
  expect(note).toContain("99.0.0");
});

test("unknown_live_version_warns_once", () => {
  expect(frontend.warnings(["ecs", "evs"], null)).toHaveLength(1);
  expect(frontend.warnings(["ecs", "evs"], undefined)).toHaveLength(1);
});
