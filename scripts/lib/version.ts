export type BumpLevel = "major" | "minor" | "patch" | "none";

export interface CommitInfo {
  hash: string;
  message: string;
  body?: string;
}

const BUMP_WEIGHT: Record<BumpLevel, number> = {
  none: 0,
  patch: 1,
  minor: 2,
  major: 3,
};

/**
 * Parses conventional commit message and body to determine the bump level.
 *
 * Rules:
 * - Breaking: type followed by `!` before `:`, or body containing `BREAKING CHANGE:` / `BREAKING-CHANGE:`
 * - Minor: `feat(...)?:`
 * - Patch: `(fix|perf|refactor)(...)?:`
 * - None: everything else (`docs:`, `chore:`, `style:`, `test:`, `ci:`, or non-conventional)
 */
export function parseCommitBump(commit: CommitInfo): BumpLevel {
  const message = commit.message.trim();
  const body = commit.body ?? "";

  // Check for breaking changes:
  // 1. Exclamation point in the subject before colon (e.g., feat!: or feat(scope)!:)
  // 2. BREAKING CHANGE: or BREAKING-CHANGE: in the commit body
  const breakingSubjectRegex = /^[a-zA-Z]+(?:\([^)]+\))?!:/;
  const breakingBodyRegex = /BREAKING[- ]CHANGE:/i;

  if (breakingSubjectRegex.test(message) || breakingBodyRegex.test(body)) {
    return "major";
  }

  // Check for minor changes: feat
  const minorRegex = /^feat(?:\([^)]+\))?:/;
  if (minorRegex.test(message)) {
    return "minor";
  }

  // Check for patch changes: fix, perf, refactor
  const patchRegex = /^(?:fix|perf|refactor)(?:\([^)]+\))?:/;
  if (patchRegex.test(message)) {
    return "patch";
  }

  return "none";
}

/**
 * Determines the highest bump level across a batch of commits.
 */
export function determineBumpLevel(commits: CommitInfo[]): BumpLevel {
  let highestLevel: BumpLevel = "none";

  for (const commit of commits) {
    const level = parseCommitBump(commit);
    if (BUMP_WEIGHT[level] > BUMP_WEIGHT[highestLevel]) {
      highestLevel = level;
      if (highestLevel === "major") {
        // Can't get higher than major
        break;
      }
    }
  }

  return highestLevel;
}

/**
 * Increments semver version according to bump level.
 * Conforms to pre-1.0 semver convention:
 * When version < 1.0.0, breaking changes bump minor instead of major.
 */
export function incrementVersion(currentVersion: string, level: BumpLevel): string {
  const cleaned = currentVersion.trim().replace(/^v/, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    throw new Error(`Invalid semver version string: "${currentVersion}"`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (level === "none") {
    return `${major}.${minor}.${patch}`;
  }

  if (major === 0) {
    // Pre-1.0 release rules
    if (level === "major" || level === "minor") {
      minor += 1;
      patch = 0;
    } else if (level === "patch") {
      patch += 1;
    }
  } else {
    // 1.0.0+ rules
    if (level === "major") {
      major += 1;
      minor = 0;
      patch = 0;
    } else if (level === "minor") {
      minor += 1;
      patch = 0;
    } else if (level === "patch") {
      patch += 1;
    }
  }

  return `${major}.${minor}.${patch}`;
}

/**
 * Calculates next version and bump level from current version and list of commits.
 */
export function calculateNextVersion(
  currentVersion: string,
  commits: CommitInfo[]
): { nextVersion: string; level: BumpLevel } {
  const level = determineBumpLevel(commits);
  const nextVersion = incrementVersion(currentVersion, level);
  return { nextVersion, level };
}
