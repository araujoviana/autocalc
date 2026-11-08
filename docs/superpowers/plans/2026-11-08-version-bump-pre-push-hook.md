# Automated Version Bump Pre-Push Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an automated version bump pre-push git hook and standalone CLI script that calculates semantic version increments from commit history since the last release, updates `package.json`, commits the release, and creates the corresponding git tag.

**Architecture:** Pure calculation logic (`calculateNextVersion`, commit parser, semver incrementer) resides in `scripts/lib/version.ts` for comprehensive unit testability; `scripts/bump-version.ts` orchestrates git inspections, file mutations, and tagging; `.githooks/pre-push` intercepts outgoing pushes to `main`, auto-bumping and tagging when unreleased functional changes are detected.

**Tech Stack:** Bun 1.4.4, TypeScript 5.9.3, Git CLI, Conventional Commits standard.

**Spec:** Brainstorming discussion (2026-11-08) — trigger on pre-push for `main`, calculate increment based on commits (breaking change -> major, `feat` -> minor, `fix`/`refactor` with code changes -> patch), update `package.json`, create release commit and git tag.

## Global Constraints

- Must run natively under Bun (`#!/usr/bin/env bun`) without adding heavy external dependencies.
- Zero git hook failures on dirty working trees: must guard against uncommitted changes before performing automated commits.
- Branch safety: automated release bumping and tagging applies only when pushing to `main`. Pushes to feature branches must not trigger release tags.
- All existing tests (`bun test:offline`), type checks (`bun run check`), and boundary checks (`bun run check:boundaries`) must continue to pass cleanly.

## Review Focus

1. **Dirty Working Directory**: If working directory has unstaged or staged modifications when pushing, the hook must not blindly run `git commit` (which could bundle unintended files); it must abort with a clear warning.
2. **Branch Guard**: Pushing a feature branch (e.g. `feature/xyz` or `fix/ci`) must pass through without tagging a release on `main`.
3. **Commit Analysis Range**: If `package.json` version has not yet been tagged (e.g., `0.3.0` was set in a commit but never tagged `v0.3.0`), the analyzer must inspect commits since the version was introduced, not just since the older `v0.2.0` tag, avoiding double-bumping.
4. **Pre-1.0 Semver Rules**: In `0.x.y` versions, breaking changes bump minor (e.g., `0.3.0` -> `0.4.0`), while `feat` bumps minor and `fix` bumps patch, conforming to standard semver practice for initial development.
5. **Pre-push Commit Propagation**: In git, creating a commit during `pre-push` requires pushing the new HEAD and tag to the remote ref directly and cancelling the original stale push ref, preventing out-of-sync remote states.

---

### Task 1: Semantic Version Calculator Core & Unit Tests

**Files:**
- Create: `scripts/lib/version.ts`
- Create: `tests/unit/version-bump.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type BumpLevel = "major" | "minor" | "patch" | "none";

  export interface CommitInfo {
    hash: string;
    message: string;
    body?: string;
  }

  export function parseCommitBump(commit: CommitInfo): BumpLevel;
  export function determineBumpLevel(commits: CommitInfo[]): BumpLevel;
  export function incrementVersion(currentVersion: string, level: BumpLevel): string;
  export function calculateNextVersion(currentVersion: string, commits: CommitInfo[]): { nextVersion: string; level: BumpLevel };
  ```

- [ ] **Step 1: Write the failing unit tests for semver and conventional commit parsing**

Create `tests/unit/version-bump.test.ts`:
```ts
import { describe, expect, it } from "bun:test";
import {
  calculateNextVersion,
  determineBumpLevel,
  incrementVersion,
  parseCommitBump,
} from "../../scripts/lib/version.ts";

describe("Semantic Version Calculator Core", () => {
  it("parses conventional commit bump levels accurately", () => {
    expect(parseCommitBump({ hash: "1", message: "feat: add new service support" })).toBe("minor");
    expect(parseCommitBump({ hash: "2", message: "feat(auth): add persistent sessions" })).toBe("minor");
    expect(parseCommitBump({ hash: "3", message: "fix: correct error code mapping" })).toBe("patch");
    expect(parseCommitBump({ hash: "4", message: "fix(ci): fix windows test runner" })).toBe("patch");
    expect(parseCommitBump({ hash: "5", message: "refactor: simplify catalog loader" })).toBe("patch");
    expect(parseCommitBump({ hash: "6", message: "perf: cache schema index" })).toBe("patch");
    expect(parseCommitBump({ hash: "7", message: "docs: update readme" })).toBe("none");
    expect(parseCommitBump({ hash: "8", message: "chore: update bunfig" })).toBe("none");
    expect(parseCommitBump({ hash: "9", message: "feat!: breaking change in CLI flags" })).toBe("major");
    expect(parseCommitBump({ hash: "10", message: "fix: update api", body: "BREAKING CHANGE: payload structure changed" })).toBe("major");
  });

  it("determines the highest bump level across a batch of commits", () => {
    expect(determineBumpLevel([
      { hash: "1", message: "docs: update docs" },
      { hash: "2", message: "chore: bump deps" },
    ])).toBe("none");

    expect(determineBumpLevel([
      { hash: "1", message: "docs: update docs" },
      { hash: "2", message: "fix: fix edge case" },
    ])).toBe("patch");

    expect(determineBumpLevel([
      { hash: "1", message: "fix: fix bug" },
      { hash: "2", message: "feat: add feature" },
    ])).toBe("minor");

    expect(determineBumpLevel([
      { hash: "1", message: "feat: add feature" },
      { hash: "2", message: "feat!: breaking change" },
    ])).toBe("major");
  });

  it("increments semver correctly for 0.x.y and >= 1.0.0", () => {
    expect(incrementVersion("0.3.0", "patch")).toBe("0.3.1");
    expect(incrementVersion("0.3.0", "minor")).toBe("0.4.0");
    // Pre-1.0: breaking changes bump minor if version < 1.0.0
    expect(incrementVersion("0.3.0", "major")).toBe("0.4.0");
    expect(incrementVersion("1.2.3", "major")).toBe("2.0.0");
    expect(incrementVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(incrementVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(incrementVersion("0.3.0", "none")).toBe("0.3.0");
  });

  it("calculates next version from current version and commit stream", () => {
    const commits = [
      { hash: "a1", message: "fix(ci): increase browser-signals timeout" },
      { hash: "a2", message: "feat(docs): upgrade service generator" },
    ];
    const result = calculateNextVersion("0.3.0", commits);
    expect(result.level).toBe("minor");
    expect(result.nextVersion).toBe("0.4.0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/version-bump.test.ts`
Expected: FAIL with "Cannot find module ../../scripts/lib/version.ts"

- [ ] **Step 3: Implement `scripts/lib/version.ts`**

Implement `parseCommitBump`, `determineBumpLevel`, `incrementVersion`, and `calculateNextVersion` using regular expressions for conventional commit syntax:
- Breaking: `^[a-zA-Z]+(\([^\)]+\))?!:` or body containing `BREAKING CHANGE:` / `BREAKING-CHANGE:`
- Minor: `^feat(\([^\)]+\))?:`
- Patch: `^(fix|perf|refactor)(\([^\)]+\))?:`
- None: everything else (`docs:`, `chore:`, `style:`, `test:`, `ci:`). Note: if needed, `determineBumpLevel` can also treat `test:` / `ci:` as `patch` if functional changes were made, but conventional commits standard treats them as chore/none.
- Handle version tuple incrementing (`[major, minor, patch]`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/version-bump.test.ts`
Expected: PASS with 4 passing tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/lib/version.ts tests/unit/version-bump.test.ts
git commit -m "feat(release): implement semantic version calculation core and unit tests"
```

---

### Task 2: Version Bump CLI Runner (`scripts/bump-version.ts`)

**Files:**
- Create: `scripts/bump-version.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `calculateNextVersion`, `determineBumpLevel` from `scripts/lib/version.ts`
- CLI flags:
  - `--dry-run`: Output target version without writing files or creating tags.
  - `--hook`: Pre-push hook mode (reads git push info, guards branch and working tree).
  - `--force`: Force bump even if only chores/docs changed.
  - default (no flags): Calculate bump, update `package.json`, commit, and tag.

- [ ] **Step 1: Write integration test for CLI runner with git fixtures**

Create `tests/unit/bump-cli.test.ts` testing git commit discovery and dry-run output against real git subcommands or mocked git runs.
Verify:
- `--dry-run` outputs JSON `{ currentVersion, nextVersion, level, commitsCount }`.
- detects dirty working tree and exits cleanly with error status 1.

- [ ] **Step 2: Implement `scripts/bump-version.ts`**

Features:
- Helper `git(args: string[]): string` executing `Bun.spawnSync(["git", ...args])`.
- Retrieve latest tag with `git describe --tags --abbrev=0 --match="v*" 2>/dev/null` or fallback to initial commit.
- Inspect `git status --porcelain` to guard against dirty working trees before any commit action.
- Read commits between latest tag (or version-intro commit) and `HEAD` via `git log <base>..HEAD --pretty=format:"%H%x1f%s%x1f%b%x1e"`.
- Compute target version using `calculateNextVersion`.
- If `level === "none"` and `--force` is false: print "No version bump needed (X commits analyzed)." and exit 0.
- When applying bump:
  - Read `package.json`, update `version: nextVersion`, write back preserving format and indentation.
  - Run `git add package.json`.
  - Run `git commit -m "chore(release): v${nextVersion}"`.
  - Run `git tag -a "v${nextVersion}" -m "Release v${nextVersion}"`.
  - Output summary: `Bumped version from X to Y (tagged vY)`.

- [ ] **Step 3: Update `package.json` scripts**

Add script shortcuts:
```json
"version:bump": "bun scripts/bump-version.ts",
"bump": "bun scripts/bump-version.ts"
```

- [ ] **Step 4: Run tests and test runner dry-run**

Run:
```bash
bun test tests/unit/version-bump.test.ts tests/unit/bump-cli.test.ts
bun scripts/bump-version.ts --dry-run
```
Expected:
- Tests pass.
- Dry run accurately reports current version (`0.3.0`), calculated next version based on commits since tag/v0.3.0, and analyzed commit count.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/bump-version.ts tests/unit/bump-cli.test.ts package.json
git commit -m "feat(release): add version bump CLI runner script"
```

---

### Task 3: Git Pre-Push Hook Integration (`.githooks/pre-push`)

**Files:**
- Create: `.githooks/pre-push`
- Modify: `package.json` (`prepare` script)
- Modify: `docs/how-to/release.md`

**Interfaces:**
- Consumes: `scripts/bump-version.ts --hook`
- Produces: Git pre-push hook configuration and automated push-time bump.

- [ ] **Step 1: Create `.githooks/pre-push`**

Write `.githooks/pre-push`:
```bash
#!/usr/bin/env bun
// Pre-push hook: ensures version bump and tags before pushing to main.

import { spawnSync } from "node:child_process";

// Git sends: <local ref> <local sha1> <remote ref> <remote sha1> on stdin
const stdin = await new Response(Bun.stdin.stream()).text();
const lines = stdin.trim().split("\n").filter(Boolean);

let pushingMain = false;
for (const line of lines) {
  const parts = line.split(" ");
  const localRef = parts[0] ?? "";
  const remoteRef = parts[2] ?? "";
  if (localRef.endsWith("/main") || remoteRef.endsWith("/main") || localRef === "refs/heads/main" || remoteRef === "refs/heads/main") {
    pushingMain = true;
    break;
  }
}

// Only enforce on main branch
if (!pushingMain) {
  process.exit(0);
}

const proc = Bun.spawnSync(["bun", "scripts/bump-version.ts", "--hook", ...process.argv.slice(2)], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(proc.exitCode ?? 0);
```
Make executable: `chmod +x .githooks/pre-push`.

- [ ] **Step 2: Add `prepare` script in `package.json`**

Ensure that running `bun install` or onboarding sets `git config core.hooksPath .githooks`:
```json
"prepare": "git config core.hooksPath .githooks"
```
Execute `git config core.hooksPath .githooks` locally to activate the hooks directory immediately.

- [ ] **Step 3: Update release documentation (`docs/how-to/release.md`)**

Document:
- Automated version calculation on `git push origin main`.
- Manual on-demand bump via `bun run bump` or `bun run bump --dry-run`.
- Bumping rules (Conventional Commits mapping to semver).

- [ ] **Step 4: Verify end-to-end hook behavior and test suite**

Run:
```bash
bun run check
bun run test:offline
bun run check:boundaries
bun run docs:build
```
Expected: All checks pass with 0 errors.

- [ ] **Step 5: Commit Task 3**

```bash
git add .githooks/pre-push package.json docs/how-to/release.md
git commit -m "feat(release): configure git pre-push hook for automated version bumping"
```
