#!/usr/bin/env bun
import * as fs from "node:fs";
import * as path from "node:path";
import {
  calculateNextVersion,
  incrementVersion,
  type BumpLevel,
  type CommitInfo,
} from "./lib/version.ts";

export interface GitOptions {
  cwd?: string;
}

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

/**
 * Execute a git command and return stdout string, throwing on failure.
 */
export function git(args: string[], options: GitOptions = {}): string {
  const result = tryGit(args, options);
  if (!result.success) {
    throw new Error(`git ${args.join(" ")} failed (exit ${result.exitCode}): ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * Execute a git command returning a structured result without throwing.
 */
export function tryGit(args: string[], options: GitOptions = {}): GitResult {
  const spawnOpts: { stdout: "pipe"; stderr: "pipe"; cwd?: string } = {
    stdout: "pipe",
    stderr: "pipe",
  };
  if (options.cwd !== undefined) {
    spawnOpts.cwd = options.cwd;
  }
  const proc = Bun.spawnSync(["git", ...args], spawnOpts);
  return {
    stdout: proc.stdout?.toString().trim() ?? "",
    stderr: proc.stderr?.toString().trim() ?? "",
    exitCode: proc.exitCode ?? 1,
    success: proc.exitCode === 0,
  };
}

/**
 * Checks whether the working tree has uncommitted modifications, staged files, or untracked changes.
 */
export function isWorkingTreeDirty(options: GitOptions = {}): boolean {
  const res = tryGit(["status", "--porcelain"], options);
  return res.stdout.length > 0;
}

/**
 * Determines the base commit or tag to calculate changes against.
 *
 * Precedence:
 * 1. Tag matching current version (e.g. `v0.3.0`).
 * 2. Commit that introduced the current version in `package.json` (avoids double-bumping if untagged).
 * 3. Latest tag matching `v*`.
 * 4. Fallback to null (all commits in repo).
 */
export function findBaseCommit(currentVersion: string, options: GitOptions = {}): string | null {
  const cleanVersion = currentVersion.replace(/^v/, "");

  // 1. Tag matching current version
  const exactTagRes = tryGit(["rev-parse", "-q", "--verify", `refs/tags/v${cleanVersion}`], options);
  if (exactTagRes.success) {
    return `v${cleanVersion}`;
  }

  // 2. Commit introducing current version in package.json
  const versionIntroRes = tryGit(
    ["log", "-n", "1", "-S", `"version": "${cleanVersion}"`, "--pretty=format:%H", "--", "package.json"],
    options
  );
  if (versionIntroRes.success && versionIntroRes.stdout) {
    return versionIntroRes.stdout.trim();
  }

  // 3. Latest tag matching v*
  const latestTagRes = tryGit(["describe", "--tags", "--abbrev=0", "--match=v*"], options);
  if (latestTagRes.success && latestTagRes.stdout) {
    return latestTagRes.stdout.trim();
  }

  // 4. Fallback to null (all commits)
  return null;
}

/**
 * Retrieves commit history between base and HEAD using unit/record separators.
 */
export function getCommits(base: string | null, options: GitOptions = {}): CommitInfo[] {
  const range = base ? `${base}..HEAD` : "HEAD";
  const res = tryGit(["log", range, '--pretty=format:%H%x1f%s%x1f%b%x1e'], options);

  if (!res.success || !res.stdout) {
    return [];
  }

  const rawRecords = res.stdout.split("\x1e");
  const commits: CommitInfo[] = [];

  for (const raw of rawRecords) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const parts = trimmed.split("\x1f");
    const hash = parts[0]?.trim() ?? "";
    const message = parts[1]?.trim() ?? "";
    const bodyText = parts[2]?.trim();

    if (hash && message) {
      const commit: CommitInfo = { hash, message };
      if (bodyText) {
        commit.body = bodyText;
      }
      commits.push(commit);
    }
  }

  return commits;
}

export interface BumpOptions {
  dryRun?: boolean;
  hook?: boolean;
  force?: boolean;
  remote?: string | undefined;
  cwd?: string | undefined;
}

export interface DryRunOutput {
  currentVersion: string;
  nextVersion: string;
  level: BumpLevel;
  commitsCount: number;
}

export async function runBumpVersion(opts: BumpOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const pkgPath = path.resolve(cwd, "package.json");

  if (!fs.existsSync(pkgPath)) {
    console.error(`Error: package.json not found at ${pkgPath}`);
    process.exit(1);
  }

  let pkgRaw = fs.readFileSync(pkgPath, "utf-8");
  let pkg: { version?: string; [key: string]: unknown };
  try {
    pkg = JSON.parse(pkgRaw);
  } catch (e) {
    console.error(`Error: failed to parse package.json: ${(e as Error).message}`);
    process.exit(1);
  }

  const currentVersion = pkg.version;
  if (!currentVersion || typeof currentVersion !== "string") {
    console.error("Error: package.json does not contain a valid version field.");
    process.exit(1);
  }

  // In hook mode, ensure we are pushing to main
  if (opts.hook) {
    const branchRes = tryGit(["branch", "--show-current"], { cwd });
    const currentBranch = branchRes.stdout.trim();
    if (currentBranch && currentBranch !== "main") {
      console.log(`Pre-push hook: Not on main branch (${currentBranch}), skipping version bump.`);
      process.exit(0);
    }
  }

  // If not dry-run, check for dirty working tree before taking any mutation action
  if (!opts.dryRun && isWorkingTreeDirty({ cwd })) {
    console.error("Error: Working tree is dirty. Commit, stash, or clean changes before bumping version.");
    process.exit(1);
  }

  // Discover commits since base
  const base = findBaseCommit(currentVersion, { cwd });
  const commits = getCommits(base, { cwd });

  let { nextVersion, level } = calculateNextVersion(currentVersion, commits);

  // If level is none but --force is passed, force a patch bump
  if (level === "none" && opts.force) {
    level = "patch";
    nextVersion = incrementVersion(currentVersion, "patch");
  }

  if (opts.dryRun) {
    const output: DryRunOutput = {
      currentVersion,
      nextVersion,
      level,
      commitsCount: commits.length,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (level === "none") {
    console.log(`No version bump needed (${commits.length} commits analyzed).`);
    return;
  }

  // Apply bump: update package.json preserving indentation and format
  const indentMatch = pkgRaw.match(/^{\n(\s+)/);
  const indent = indentMatch ? indentMatch[1] : 2;
  pkg.version = nextVersion;
  const updatedPkgRaw = JSON.stringify(pkg, null, indent) + "\n";
  fs.writeFileSync(pkgPath, updatedPkgRaw, "utf-8");

  // Git add, commit, tag
  git(["add", "package.json"], { cwd });
  git(["commit", "-m", `chore(release): v${nextVersion}`], { cwd });
  git(["tag", "-a", `v${nextVersion}`, "-m", `Release v${nextVersion}`], { cwd });

  if (opts.hook) {
    const remote = opts.remote ?? "origin";
    git(["push", "--no-verify", remote, "HEAD:refs/heads/main", `refs/tags/v${nextVersion}`], { cwd });
    console.log(`[pre-push] Automatically bumped version to ${nextVersion} (tag v${nextVersion}) and pushed to ${remote}.`);
    console.log(`[pre-push] Cancelling stale pre-bump push.`);
    process.exit(1);
  }

  console.log(`Bumped version from ${currentVersion} to ${nextVersion} (tagged v${nextVersion})`);
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const hook = args.includes("--hook");
  const force = args.includes("--force");
  let remote: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--remote" && args[i + 1]) {
      remote = args[i + 1];
      i++;
    } else if (arg.startsWith("--remote=")) {
      remote = arg.slice("--remote=".length);
    }
  }

  const opts: BumpOptions = { dryRun, hook, force };
  if (remote !== undefined) {
    opts.remote = remote;
  }

  runBumpVersion(opts).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
