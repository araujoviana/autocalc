---
status: accepted
date: 2026-10-16
---

# Windows and Linux are both first-class

## Context and Problem Statement

Colleagues use both Windows and Linux. The code assumes Linux in places: `~/.config` paths,
`chmod 600`, the browser lookup by Linux binary names, and a single-OS CI.

## Considered Options

* Linux only (Windows users on WSL).
* Both, tested in CI.

## Decision Outcome

Chosen option: **both, tested in CI**:
* Paths come from a platform-directories library, never hard-coded.
* Browser detection uses Playwright's `chrome`/`msedge` channels and falls back to known install
  locations.
* Files are written as UTF-8 explicitly.
* The installer has a PowerShell twin (`install.ps1`).
* CI runs on `ubuntu-latest` and `windows-latest`.

### Consequences

* Good, because nobody needs WSL to use autocalc.
* Bad, because CI time doubles, and some tests need platform guards.
