import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const CLI_PATH = path.resolve(__dirname, "../../scripts/bump-version.ts");

function runGit(args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: proc.stdout?.toString().trim() ?? "",
    stderr: proc.stderr?.toString().trim() ?? "",
    exitCode: proc.exitCode ?? 1,
  };
}

function runCli(args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(["bun", CLI_PATH, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: proc.stdout?.toString().trim() ?? "",
    stderr: proc.stderr?.toString().trim() ?? "",
    exitCode: proc.exitCode ?? 1,
  };
}

describe("Version Bump CLI Runner (scripts/bump-version.ts)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bump-cli-test-"));
    runGit(["init", "-b", "main"], tempDir);
    runGit(["config", "user.name", "Test User"], tempDir);
    runGit(["config", "user.email", "test@example.com"], tempDir);
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function setupRepo(initialVersion = "0.3.0", tagInitial = true) {
    const pkgContent = {
      name: "test-package",
      version: initialVersion,
    };
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify(pkgContent, null, 2) + "\n"
    );
    runGit(["add", "package.json"], tempDir);
    runGit(["commit", "-m", "chore(release): v" + initialVersion], tempDir);
    if (tagInitial) {
      runGit(["tag", "-a", `v${initialVersion}`, "-m", `Release v${initialVersion}`], tempDir);
    }
  }

  it("--dry-run outputs valid JSON with currentVersion, nextVersion, level, and commitsCount", () => {
    setupRepo("0.3.0", true);

    // Add a feat commit (minor bump in 0.x.y)
    fs.writeFileSync(path.join(tempDir, "feature.txt"), "hello");
    runGit(["add", "feature.txt"], tempDir);
    runGit(["commit", "-m", "feat: implement shiny new feature"], tempDir);

    const result = runCli(["--dry-run"], tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual({
      currentVersion: "0.3.0",
      nextVersion: "0.4.0",
      level: "minor",
      commitsCount: 1,
    });
  });

  it("--dry-run outputs level 'patch' when only fix commits exist", () => {
    setupRepo("0.3.0", true);

    fs.writeFileSync(path.join(tempDir, "fix.txt"), "fixed");
    runGit(["add", "fix.txt"], tempDir);
    runGit(["commit", "-m", "fix: resolve timeout issue"], tempDir);

    const result = runCli(["--dry-run"], tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual({
      currentVersion: "0.3.0",
      nextVersion: "0.3.1",
      level: "patch",
      commitsCount: 1,
    });
  });

  it("--dry-run outputs level 'none' when only docs/chore commits exist", () => {
    setupRepo("0.3.0", true);

    fs.writeFileSync(path.join(tempDir, "README.md"), "# Docs");
    runGit(["add", "README.md"], tempDir);
    runGit(["commit", "-m", "docs: update documentation"], tempDir);

    const result = runCli(["--dry-run"], tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual({
      currentVersion: "0.3.0",
      nextVersion: "0.3.0",
      level: "none",
      commitsCount: 1,
    });
  });

  it("--force forces a patch bump when only chore commits exist", () => {
    setupRepo("0.3.0", true);

    fs.writeFileSync(path.join(tempDir, "chore.txt"), "chore");
    runGit(["add", "chore.txt"], tempDir);
    runGit(["commit", "-m", "chore: maintenance update"], tempDir);

    const result = runCli(["--dry-run", "--force"], tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual({
      currentVersion: "0.3.0",
      nextVersion: "0.3.1",
      level: "patch",
      commitsCount: 1,
    });
  });

  it("detects dirty working tree and exits cleanly with error status 1", () => {
    setupRepo("0.3.0", true);

    // Make working tree dirty with unstaged modification
    fs.writeFileSync(path.join(tempDir, "package.json"), "dirty-content");

    const result = runCli([], tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("dirty");
  });

  it("detects staged dirty changes and exits cleanly with error status 1", () => {
    setupRepo("0.3.0", true);

    // Make working tree dirty with staged change
    fs.writeFileSync(path.join(tempDir, "staged.txt"), "staged");
    runGit(["add", "staged.txt"], tempDir);

    const result = runCli([], tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("dirty");
  });

  it("allows --dry-run even if working tree is dirty", () => {
    setupRepo("0.3.0", true);

    fs.writeFileSync(path.join(tempDir, "feature.txt"), "hello");
    runGit(["add", "feature.txt"], tempDir);
    runGit(["commit", "-m", "feat: add feature"], tempDir);

    // Dirty the tree
    fs.writeFileSync(path.join(tempDir, "uncommitted.txt"), "dirty");

    const result = runCli(["--dry-run"], tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.nextVersion).toBe("0.4.0");
  });

  it("applies bump: updates package.json, commits, and tags release", () => {
    setupRepo("0.3.0", true);

    fs.writeFileSync(path.join(tempDir, "feature.txt"), "feature");
    runGit(["add", "feature.txt"], tempDir);
    runGit(["commit", "-m", "feat: new capability"], tempDir);

    const result = runCli([], tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Bumped version from 0.3.0 to 0.4.0 (tagged v0.4.0)");

    // Verify package.json was updated
    const updatedPkg = JSON.parse(fs.readFileSync(path.join(tempDir, "package.json"), "utf-8"));
    expect(updatedPkg.version).toBe("0.4.0");

    // Verify git commit exists
    const lastCommitMsg = runGit(["log", "-1", "--pretty=%s"], tempDir).stdout;
    expect(lastCommitMsg).toBe("chore(release): v0.4.0");

    // Verify git tag exists
    const tags = runGit(["tag", "-l"], tempDir).stdout.split("\n");
    expect(tags).toContain("v0.4.0");
  });

  it("exits 0 with message when no bump is needed", () => {
    setupRepo("0.3.0", true);

    fs.writeFileSync(path.join(tempDir, "doc.md"), "documentation");
    runGit(["add", "doc.md"], tempDir);
    runGit(["commit", "-m", "docs: update docs"], tempDir);

    const result = runCli([], tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No version bump needed (1 commits analyzed).");

    // package.json should remain untouched
    const pkg = JSON.parse(fs.readFileSync(path.join(tempDir, "package.json"), "utf-8"));
    expect(pkg.version).toBe("0.3.0");

    // No release tag created
    const tags = runGit(["tag", "-l"], tempDir).stdout.split("\n");
    expect(tags).not.toContain("v0.3.1");
  });

  it("handles untagged current version by finding version-intro commit", () => {
    // 0.2.0 was tagged, then 0.3.0 was committed without tag
    setupRepo("0.2.0", true);

    // Commit that introduced 0.3.0
    const pkgContent = { name: "test-package", version: "0.3.0" };
    fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(pkgContent, null, 2) + "\n");
    runGit(["add", "package.json"], tempDir);
    runGit(["commit", "-m", "chore: bump to 0.3.0"], tempDir);

    // Commit after 0.3.0 intro: a fix
    fs.writeFileSync(path.join(tempDir, "fix.txt"), "fix");
    runGit(["add", "fix.txt"], tempDir);
    runGit(["commit", "-m", "fix: patch after 0.3.0 intro"], tempDir);

    const result = runCli(["--dry-run"], tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual({
      currentVersion: "0.3.0",
      nextVersion: "0.3.1",
      level: "patch",
      commitsCount: 1,
    });
  });

  it("--hook mode guards branch and skips non-main branches", () => {
    setupRepo("0.3.0", true);

    // Switch to a feature branch
    runGit(["checkout", "-b", "feature/my-branch"], tempDir);

    fs.writeFileSync(path.join(tempDir, "feature.txt"), "feature");
    runGit(["add", "feature.txt"], tempDir);
    runGit(["commit", "-m", "feat: branch feature"], tempDir);

    const result = runCli(["--hook"], tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("main");

    // No release commit or tag created
    const lastCommitMsg = runGit(["log", "-1", "--pretty=%s"], tempDir).stdout;
    expect(lastCommitMsg).toBe("feat: branch feature");
  });
});
