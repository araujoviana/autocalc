---
status: accepted
date: 2026-10-16
---

# Distribution: `uv tool install` from git tags, with an update notice

## Context and Problem Statement

Today, installing means cloning the repo and running `uv sync`. Users want "the less work the
better", including for updates. The repo stays private until v1, and nothing internal is ever
published.

## Considered Options

* PyPI package.
* A one-line installer (`curl … | sh`, and `irm … | iex` on Windows) that runs
  `uv tool install git+…@<tag>`.
* Silent auto-update.

## Decision Outcome

Chosen option: **the one-line installer**, which:
* installs `uv` if missing;
* installs autocalc from a semver git tag;
* sets up a browser (system browser preferred, ADR-0011);
* registers the MCP server with the user's agent.

Updating:
* `autocalc update [--to vX]` updates on request.
* Tool results carry an update notice at most once a day.
* There is **no silent auto-update**: a quoting tool must not change behavior between two quotes
  without the user knowing.

### Consequences

* Good, because installing and updating are one command each, on both OSes.
* Bad, because the installer must be maintained for two shells.
