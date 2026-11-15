# Design

## Context

`scripts/generate-service-docs.ts` is the sole owner of `docs/reference/services/*.md`, enforced by `tests/unit/docs-contract.test.ts`. Meanwhile, `status.md`, `handoff.md`, `roadmap.md`, `README.md`, and `docs/explanation/core.md` drifted across the Python-to-TypeScript migration ([ADR-0017](../../../docs/adr/0017-typescript-on-bun-is-the-target.md)) and subsequent service coverage updates.

## Goals / Non-Goals

**Goals:**
- Provide a single-page `docs/architecture.md` curated for contributors jumping into the TypeScript codebase.
- Eliminate conflicting version numbers (`0.7.0` vs `0.6.0` vs `0.3.0`), conflicting verified counts (`40` vs `41`), and stale Python-era prose (`docs/explanation/core.md`, `README.md`).
- Give `status.md`, `handoff.md`, and `roadmap.md` unmistakable, non-overlapping responsibilities documented at the top of each file.
- Repair the pre-existing invalid parameter bug in `tests/live/catalog.test.ts:12`.

**Non-Goals:**
- Restructuring `docs/adr/` (accepted ADRs are immutable per ADR-0000).
- Auto-regenerating or pruning `site/` build artifacts manually (leave `site/` untracked / managed by `mkdocs build`).

## Decisions

1. **Role boundary across `status.md`, `handoff.md`, `roadmap.md`**:
   - `docs/status.md`: Published baseline snapshot (`version`, branch, verified service count `VERIFIED.size`, live/offline benchmark summary pointers).
   - `docs/roadmap.md`: Single authoritative backlog of open items and OpenSpec changes (preserving table convention).
   - `docs/handoff.md`: Concise operational continuation note (pointers to `status.md`, `roadmap.md`, and active workspace commands — no duplicated tables).

2. **Dynamic `VERIFIED.size` in `scripts/generate-service-docs.ts`**:
   - Compute verified service count directly from imported `VERIFIED.size` (`src/core/services/publication.ts`) rather than string-literal `40`.

3. **Docs contract assertion (`tests/unit/docs-contract.test.ts`)**:
   - Check that `docs/architecture.md` exists and is indexed in `mkdocs.yml`, and assert `docs/reference/services/index.md` displays the exact runtime `VERIFIED.size`.

4. **Repair `tests/live/catalog.test.ts:12-13`**:
   - Pass `{}` to `list_regions` (matching `ListRegionsInput` in `src/core/schemas.ts:206` and `src/core/actions.ts:71`) and assert `expect((regions as Record<string, string>)["la-south-2"]).toBeDefined()` (or matching string).

## Risks / Trade-offs

- Editing `docs/status.md` or `docs/reference/cli.md` interacts with `tests/unit/docs-contract.test.ts` regex/checks; verify immediately with `bun test tests/unit/docs-contract.test.ts` and `bun run docs:generate`.

## Migration / Verification Plan

1. Author `docs/architecture.md`, reconcile `status.md` / `roadmap.md` / `handoff.md` / `README.md` / `docs/explanation/core.md`, update `mkdocs.yml` & `docs/index.md`.
2. Fix `scripts/generate-service-docs.ts:1048`, run `bun run docs:generate`, extend `tests/unit/docs-contract.test.ts`, and fix `tests/live/catalog.test.ts`.
3. Run `bun run check && bun run check:boundaries && bun run test:offline` (and `AUTOCALC_LIVE=1 bun test tests/live/catalog.test.ts` if session active during Fase 3), plus `bun run docs:build` if `uv`/`mkdocs` is available.
