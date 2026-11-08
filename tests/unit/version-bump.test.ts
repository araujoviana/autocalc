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

  it("handles edge cases in commit parsing", () => {
    // BREAKING-CHANGE with hyphen in body
    expect(parseCommitBump({ hash: "11", message: "chore: big update", body: "BREAKING-CHANGE: removed deprecated flag" })).toBe("major");
    // Breaking change exclamation with scope
    expect(parseCommitBump({ hash: "12", message: "refactor(core)!: redesign plugin engine" })).toBe("major");
    // Random commit message that does not follow conventional commits
    expect(parseCommitBump({ hash: "13", message: "misc quick fix" })).toBe("none");
  });

  it("determines the highest bump level across a batch of commits", () => {
    expect(determineBumpLevel([])).toBe("none");

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

    expect(determineBumpLevel([
      { hash: "1", message: "feat: new feature" },
      { hash: "2", message: "fix: something", body: "BREAKING CHANGE: api altered" },
      { hash: "3", message: "docs: add notes" },
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

    // Check with 'v' prefix if present
    expect(incrementVersion("v1.0.0", "minor")).toBe("1.1.0");
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

  it("returns current version when there are no bumping commits", () => {
    const commits = [
      { hash: "a1", message: "docs: typo" },
      { hash: "a2", message: "chore(deps): update" },
    ];
    const result = calculateNextVersion("0.3.0", commits);
    expect(result.level).toBe("none");
    expect(result.nextVersion).toBe("0.3.0");
  });
});
