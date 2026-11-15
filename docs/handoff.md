# Handoff

> **Role**: Short session-resumption pointer. Avoid duplicating status tables or backlogs here — those live in their canonical pages below.

Last updated 2026-11-15 (`v0.7.0` on `main`).

## Where to Start

- **Architecture & codebase map**: [Code Architecture](architecture.md) (`draft → plan → apply → gate → publish`, concurrency limits, and *Where to touch for X*).
- **Current release, counts & benchmark snapshot**: [Project Status](status.md).
- **Open backlog & delivered OpenSpec track**: [Roadmap](roadmap.md) (add new open items here instead of GitHub issues).
- **Diagnostics & measurements**: [Performance Diagnosis](research/performance-diagnosis.md).

## Routine Verification

```bash
bun run check
bun run check:boundaries
bun run test:offline
bun run bench && bun run bench:report
```

- Live tests (`bun run test:live`) and live benchmarks (`bun run bench -- --live`) require an active calculator session and network access; do not run them unattended.
