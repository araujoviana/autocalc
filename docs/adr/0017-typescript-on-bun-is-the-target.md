---
status: proposed
date: 2026-11-02
---

# TypeScript on Bun is the target implementation

## Context and Problem Statement

autocalc drives a website: the calculator page is the encoder (ADR-0001), so most of the code
is browser automation plus a web-facing MCP server. The Python package is canonical today
(ADR-0016), and an experimental Bun port exists on `origin/bun-migration-review`
(`experimental/bun/`, 22 builders, CLI and MCP entry points). It lacks the draft/revise/publish
workflow and the page-encoder publish gate. The current page interaction breaks easily when the
vendor changes the calculator, and it is to be reworked later.

Which language should be the long-term implementation?

## Considered Options

* **Stay on Python** (status quo, ADR-0016). Good MCP support; working and packaged.
* **Migrate to TypeScript on Bun.** Playwright's first-class language, shares the web
  platform's types and idioms with the page being driven, strong MCP SDK.
* **Maintain both.** Doubles every fix and every spec check.

## Decision Outcome

Chosen option: **migrate to TypeScript on Bun**, because the work is web interaction and
Playwright is best supported in TypeScript. The page-interaction rework (the main fragility
today) is then done once, in the language it will live in.

Python stays the released implementation until the TypeScript side reaches parity. Parity means:

* the same OpenSpec requirements pass (draft → revise → publish, the fail-closed gate of
  ADR-0003, request fidelity of ADR-0016);
* the same golden corpus and Edit-agreement checks pass on both sides;
* installation works on Windows and Linux (ADR-0012), with distribution replacing ADR-0013.

On parity, Python is removed in one change. No long-term dual maintenance.

This supersedes only the "Python is canonical" and "TypeScript branches are research
artifacts" statements of ADR-0016. Its request-fidelity rule and its supersession of ADR-0014
stay in force.

### Consequences

* Good, because the browser layer is rewritten once, in the better-supported language.
* Bad, because parity needs the workflow, gate and page-encoder ported, and until then every
  Python fix must also land in the TypeScript tree.
* Bad, because ADR-0013 (`uv tool` install) becomes obsolete and needs its own successor.
