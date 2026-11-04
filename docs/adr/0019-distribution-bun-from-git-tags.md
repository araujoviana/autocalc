---
status: accepted
date: 2026-11-03
---

# Distribution: `bun add -g` from git tags, with an update notice

## Context and Problem Statement

With TypeScript on Bun replacing Python as the implementation (ADR-0017), ADR-0013's `uv tool install`
path can no longer install or update `autocalc`. Users still want a single command to install and update
on Linux and Windows (ADR-0012), from a semver git tag without publishing to a public package registry
before v1, and without silent auto-updates.

## Considered Options

* **`bun add -g --force git+<repo>#<tag>`** from a one-line installer (`curl … | sh`, and `irm … | iex`
  on Windows) that installs `bun` if missing.
* **Pre-compiled standalone binaries (`bun build --compile`)** attached to GitHub Releases.
* **npm package**.

## Decision Outcome

Chosen option: **`bun add -g` from a git tag via the one-line installer**, which:
* installs `bun` if missing (`https://bun.sh/install` on Linux, `https://bun.sh/install.ps1` on Windows);
* installs `autocalc` and `autocalc-mcp` globally from the newest `v<major>.<minor>.<patch>` git tag
  (`bun add -g --force "git+$REPO#$ref"`);
* keeps the existing system-browser preference (ADR-0011);
* registers the MCP server with the user's agent (`claude mcp add` when on `PATH`).

Updating:
* `autocalc update [--to vX.Y.Z]` runs `bun add -g --force "git+$REPO#$tag"` on request.
* Tool results continue to carry an update notice at most once a day.
* There is **no silent auto-update**.

This supersedes [ADR-0013](0013-distribution-uv-tool-from-git-tags.md).

### Consequences

* Good, because installing and updating stay one command on both OSes with no release-build pipeline
  or native binary signing required, and the same `bun` runtime runs both the CLI/MCP server and
  Playwright.
* Bad, because users upgrading across the Python-to-TypeScript cutover must run the installer once to
  switch from `uv` to `bun`.
