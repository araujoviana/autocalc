/** `autocalc update`: reinstall the tool from a release tag (ADR-0019). Never runs on its own. */

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import pkg from "../../package.json";
import { CalculatorError } from "./errors.ts";

export const REPO = "https://github.com/araujoviana/autocalc.git";
const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

export interface CmdResult {
  returncode: number;
  stdout: string;
  stderr: string;
}

function defaultRun(cmd: string[], options?: { timeout?: number }): CmdResult {
  const proc = Bun.spawnSync(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    ...(options?.timeout !== undefined ? { timeout: options.timeout * 1000 } : {}),
  });
  if (proc.signalCode === "SIGTERM" || proc.exitCode === null) {
    throw new Error(`Command timed out: ${cmd.join(" ")}`);
  }
  return {
    returncode: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
  };
}

export const hooks = {
  run: defaultRun as (cmd: string[], options?: { timeout?: number }) => CmdResult,
  version: (_name = "autocalc"): string => pkg.version,
  notice: null as (() => string | null) | null,
  warn: (msg: string): void => {
    console.warn(msg);
  },
};

export function resetHooks(): void {
  hooks.run = defaultRun;
  hooks.version = () => pkg.version;
  hooks.notice = null;
  hooks.warn = msg => console.warn(msg);
}

function repoUrl(): string {
  return process.env.AUTOCALC_REPO || REPO;
}

function configDir(): string {
  return process.env.AUTOCALC_CONFIG || join(homedir(), ".config", "autocalc");
}

function parseTagNumbers(tag: string): [number, number, number] {
  const m = TAG_RE.exec(tag);
  return [Number(m?.[1] ?? 0), Number(m?.[2] ?? 0), Number(m?.[3] ?? 0)];
}

function compareTuples(a: readonly number[], b: readonly number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function versionKey(tag: string): number[] {
  return (tag.match(/\d+/g) ?? []).slice(0, 3).map(Number);
}

/** Newest `vX.Y.Z` tag, compared as numbers (`v0.10.0` is newer than `v0.9.0`). */
export function latestTag(repo: string): string {
  let out: CmdResult;
  try {
    out = hooks.run(["git", "ls-remote", "--tags", "--refs", repo, "v*"], { timeout: 3 });
  } catch (exc) {
    throw new CalculatorError(
      "UPDATE_FAILED",
      `Could not list the release tags: ${exc instanceof Error ? exc.message : String(exc)}`,
      "Is git installed and the network up?",
    );
  }
  if (out.returncode !== 0) {
    throw new CalculatorError(
      "UPDATE_FAILED",
      "Could not list the release tags.",
      out.stderr.trim() || "Check network and git access.",
    );
  }
  const tags: string[] = [];
  for (const line of out.stdout.split(/\r?\n/)) {
    const idx = line.lastIndexOf("refs/tags/");
    if (idx === -1) continue;
    const t = line.slice(idx + "refs/tags/".length).trim();
    if (TAG_RE.test(t)) tags.push(t);
  }
  if (!tags.length) {
    throw new CalculatorError(
      "UPDATE_FAILED",
      "No release tag (vX.Y.Z) found.",
      "Pass --to vX.Y.Z, or ask the maintainer to tag a release.",
    );
  }
  return tags.reduce((best, cur) =>
    compareTuples(parseTagNumbers(cur), parseTagNumbers(best)) > 0 ? cur : best,
  );
}

/** Reinstall from `to` (a release tag) or the newest tag; returns a one-line summary. */
export function update(to?: string | null): string {
  if (to !== undefined && to !== null && !TAG_RE.test(to)) {
    throw new CalculatorError(
      "UPDATE_FAILED",
      `'${to}' is not a release tag.`,
      "Use the form vX.Y.Z, e.g. --to v0.2.0.",
    );
  }
  const repo = repoUrl();
  const old = hooks.version("autocalc");
  const tag = to || latestTag(repo);
  const bunBin = process.env.BUN_INSTALL
    ? join(process.env.BUN_INSTALL, "bin")
    : join(homedir(), ".bun", "bin");
  try {
    unlinkSync(join(bunBin, "autocalc"));
  } catch {}
  try {
    unlinkSync(join(bunBin, "autocalc-mcp"));
  } catch {}
  let done: CmdResult;
  try {
    done = hooks.run(["bun", "add", "-g", "--force", `git+${repo}#${tag}`]);
  } catch (exc) {
    throw new CalculatorError(
      "UPDATE_FAILED",
      `Could not run bun: ${exc instanceof Error ? exc.message : String(exc)}`,
      "Install bun (https://bun.sh/) or run the installer.",
    );
  }
  if (done.returncode !== 0) {
    const hint = done.stderr.trim().slice(-300) || undefined;
    throw new CalculatorError("UPDATE_FAILED", `bun could not install ${tag}.`, hint);
  }
  return `autocalc ${old} -> ${tag.replace(/^v/, "")}`;
}

/** A one-line update notice, at most one tag lookup a day; never raises, never updates (ADR-0013). */
export function notice(): string | null {
  if (hooks.notice) return hooks.notice();
  if (process.env.AUTOCALC_NO_UPDATE_CHECK) return null;
  const stamp = join(configDir(), "update-check.json");
  const now = Date.now() / 1000;
  try {
    const seen = JSON.parse(readFileSync(stamp, "utf-8")) as { at?: number };
    if (typeof seen.at === "number" && now - seen.at < 86400) return null;
  } catch {
    // Missing or unreadable stamp file; proceed to check.
  }
  try {
    mkdirSync(dirname(stamp), { recursive: true });
    writeFileSync(stamp, JSON.stringify({ at: now }), "utf-8");
    const tag = latestTag(repoUrl());
    const have = hooks.version("autocalc");
    return compareTuples(versionKey(tag), versionKey(have)) > 0
      ? `autocalc ${tag.replace(/^v/, "")} is available (you have ${have}); run \`autocalc update\`.`
      : null;
  } catch {
    return null;
  }
}

/** Attach notices to objects, or log them without changing a list/scalar contract. */
export function withNotice<T>(result: T): T {
  const note = notice();
  if (note) {
    if (result !== null && typeof result === "object" && !Array.isArray(result)) {
      return { ...result, update_notice: note };
    }
    hooks.warn(note);
  }
  return result;
}
