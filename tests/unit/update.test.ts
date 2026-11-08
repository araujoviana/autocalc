/** `autocalc update`: tag choice, argument checks and failures. git and uv are faked (`tests/test_update.py`). */

import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CalculatorError } from "../../src/core/errors.ts";
import * as update from "../../src/core/update.ts";

const savedRepo = process.env.AUTOCALC_REPO;
const savedConfig = process.env.AUTOCALC_CONFIG;
const savedNoCheck = process.env.AUTOCALC_NO_UPDATE_CHECK;
const savedBunInstall = process.env.BUN_INSTALL;
let tempDirs: string[] = [];

afterEach(() => {
  update.resetHooks();
  if (savedRepo === undefined) delete process.env.AUTOCALC_REPO;
  else process.env.AUTOCALC_REPO = savedRepo;
  if (savedConfig === undefined) delete process.env.AUTOCALC_CONFIG;
  else process.env.AUTOCALC_CONFIG = savedConfig;
  if (savedNoCheck === undefined) delete process.env.AUTOCALC_NO_UPDATE_CHECK;
  else process.env.AUTOCALC_NO_UPDATE_CHECK = savedNoCheck;
  if (savedBunInstall === undefined) delete process.env.BUN_INSTALL;
  else process.env.BUN_INSTALL = savedBunInstall;
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "autocalc-update-"));
  tempDirs.push(dir);
  return dir;
}

function runWith(tags = "", gitRc = 0, uvRc = 0): string[][] {
  const calls: string[][] = [];
  update.hooks.run = cmd => {
    calls.push(cmd);
    if (cmd[0] === "git") {
      const out = tags
        .split(/\s+/)
        .filter(Boolean)
        .map(t => `abc\trefs/tags/${t}\n`)
        .join("");
      return { returncode: gitRc, stdout: out, stderr: "denied" };
    }
    return { returncode: uvRc, stdout: "", stderr: "boom" };
  };
  process.env.AUTOCALC_REPO = "file:///repo";
  return calls;
}

test("newest_tag_is_compared_by_number_and_installed", () => {
  const calls = runWith("v0.9.0 v0.10.0 v0.2.1 v1.0.0-rc1 nightly");
  const out = update.update();
  expect(calls.at(-1)).toEqual(["bun", "add", "-g", "--force", "git+file:///repo#v0.10.0"]);
  expect(out.endsWith("-> 0.10.0")).toBe(true);
});

test("update_removes_stale_global_bins_before_bun_add", () => {
  const fakeBunDir = makeTmpDir();
  const binDir = join(fakeBunDir, "bin");
  mkdtempSync; // imported
  const fs = require("node:fs");
  fs.mkdirSync(binDir, { recursive: true });
  const staleCli = join(binDir, "autocalc");
  const staleMcp = join(binDir, "autocalc-mcp");
  fs.writeFileSync(staleCli, "old");
  fs.writeFileSync(staleMcp, "old");
  process.env.BUN_INSTALL = fakeBunDir;

  runWith("v1.0.0");
  update.update("v1.0.0");

  expect(fs.existsSync(staleCli)).toBe(false);
  expect(fs.existsSync(staleMcp)).toBe(false);
});

test("pinned_tag_skips_the_listing", () => {
  const calls = runWith("v9.0.0");
  update.update("v0.1.0");
  expect(calls.map(c => c[0])).toEqual(["bun"]);
  expect(calls[0]!.at(-1)?.endsWith("#v0.1.0")).toBe(true);
});

test("not_a_release_tag_runs_nothing", () => {
  const calls = runWith();
  let caught: CalculatorError | undefined;
  try {
    update.update("main");
  } catch (err) {
    caught = err as CalculatorError;
  }
  expect(caught).toBeDefined();
  expect(caught?.code).toBe("UPDATE_FAILED");
  expect(`${caught?.message} ${caught?.hint}`).toContain("vX.Y.Z");
  expect(calls).toEqual([]);
});

test("no_tag_and_failures_are_named", () => {
  runWith("");
  expect(() => update.update()).toThrow(/No release tag/);

  runWith("", 128);
  expect(() => update.update()).toThrow(/list the release tags/);

  runWith("v0.2.0", 0, 1);
  let caught: CalculatorError | undefined;
  try {
    update.update();
  } catch (err) {
    caught = err as CalculatorError;
  }
  expect(caught).toBeDefined();
  expect(caught?.message).toContain("v0.2.0");
  expect(caught?.code).toBe("UPDATE_FAILED");
});

test("notice_looks_up_once_a_day_and_never_updates", () => {
  const tmpPath = makeTmpDir();
  process.env.AUTOCALC_CONFIG = tmpPath;
  delete process.env.AUTOCALC_NO_UPDATE_CHECK;
  update.hooks.version = () => "0.1.0";
  const calls = runWith("v0.2.0");
  expect(update.notice()).toContain("0.2.0 is available");
  expect(update.notice()).toBeNull(); // same day: no second lookup
  expect(calls.map(c => c[0])).toEqual(["git"]);
  expect(update.withNotice([1])).toEqual([1]);
});

test("notice_is_silent_when_current_or_offline", () => {
  const tmpPath = makeTmpDir();
  process.env.AUTOCALC_CONFIG = tmpPath;
  delete process.env.AUTOCALC_NO_UPDATE_CHECK;
  update.hooks.version = () => "0.2.0";
  runWith("v0.2.0");
  expect(update.notice()).toBeNull();
  unlinkSync(join(tmpPath, "update-check.json"));
  runWith("", 1);
  expect(update.notice()).toBeNull();
});

test("list_notice_is_logged_without_changing_rows", () => {
  update.hooks.notice = () => "autocalc 1.0.0 is available";
  const warnings: string[] = [];
  update.hooks.warn = msg => warnings.push(msg);
  const rows = [{ spec: "x" }];
  expect(update.withNotice(rows)).toBe(rows);
  expect(warnings.join("\n")).toContain("1.0.0 is available");
});
