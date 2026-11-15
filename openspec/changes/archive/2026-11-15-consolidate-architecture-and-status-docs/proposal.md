# Proposal

## Why

Fase 1 documentation inventory ([performance-diagnosis.md](../../../docs/research/performance-diagnosis.md#L198-L222)) uncovered conflicting sources of truth and missing onboarding guidance across `170` docs files:

1. **No single-page code architecture entrypoint:** `docs/explanation/architecture.md` explains conceptual layers ("declarative / canonical / vendor"), but there is no `docs/architecture.md` explaining the real TypeScript code flow (`draft → plan → apply → gate → publish`), module boundaries, or *"where to touch for X"*.
2. **Version and state drift across `status.md`, `handoff.md`, and `roadmap.md`:** `package.json` is at `0.7.0` on `main`, while `docs/status.md` reports `0.6.0` on `feat/latam-cce-iaas-dms-coverage` and `docs/handoff.md` still cites `0.3.0`, with overlapping status/backlog prose across all three files.
3. **Hardcoded/stale facts in docs and generators:** `scripts/generate-service-docs.ts:1048` hardcodes `40 services` instead of reading `VERIFIED.size` (`41`), `docs/status.md:27` vs `docs/reference/services/cce.md:64` contradict on CCE Turbo, `README.md` still shows legacy `cards:` / `[autocalc]` examples, omits `AUTOCALC_DATA`, lists `AUTOCALC_ENCODE_WORKERS = 6` when the code cap is `3`, lacks `bench` / `bench:report` docs, and `docs/explanation/core.md:39-42` states *"The core does not publish, total a draft or expose tools"* (stale Python strangler prose).
4. **Pre-existing failure in live test suite:** `tests/live/catalog.test.ts:12` fails `public catalog and rating are available` by calling `list_regions` with `{ region: "Santiago" }`, violating `ListRegionsInput` (`src/core/schemas.ts:206`: `{ service?: string }`).

## What Changes

- Create `docs/architecture.md` (1-page system overview, Mermaid flow diagram of `draft → plan → apply → gate → publish`, concurrency/state table, *"onde mexer para X"* index, and `bun run bench` / `bun run bench:report` documentation) and add it to `mkdocs.yml` navigation and `docs/index.md`.
- Establish clear, non-overlapping responsibilities across `docs/status.md` (`0.7.0` verified counts, live/offline benchmark baselines), `docs/roadmap.md` (single backlog, syncing completed vs open optimization/docs items), and `docs/handoff.md` (concise session resumption pointer without duplicating status/roadmap).
- Replace the hardcoded `40 services` string in `scripts/generate-service-docs.ts:1048` with dynamic `VERIFIED.size` (`41`), align CCE Turbo notes between `docs/status.md` and generator/compat summaries, and run `bun run docs:generate`.
- Update `README.md` (`version: "1"`, `AUTOCALC_DATA`, `AUTOCALC_ENCODE_WORKERS` default cap `<= 3`, benchmark scripts) and update `docs/explanation/core.md` to match the TypeScript architecture ([ADR-0017](../../../docs/adr/0017-typescript-on-bun-is-the-target.md)).
- Extend `tests/unit/docs-contract.test.ts` to assert `docs/architecture.md` presence/navigation and match between `docs/reference/services/index.md` and `VERIFIED.size`.
- Fix `tests/live/catalog.test.ts:12-13` so `list_regions` uses valid `ListRegionsInput` (`{}`) and checks `la-south-2` presence.
- Out of scope: altering runtime `src/` behavior, editing historical archived plans (`docs/superpowers/plans/`, `openspec/changes/archive/`), or deleting `.agents/`/`.claude/`/`.gemini/`/`.opencode/` skill directories managed locally via `openspec update`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `dev-quality`: Verify documentation consistency (`docs/architecture.md` entrypoint and dynamic verified service counts) inside the offline docs-contract tests.

## Impact

- Code/docs touched: `docs/architecture.md`, `docs/index.md`, `docs/status.md`, `docs/handoff.md`, `docs/roadmap.md`, `docs/explanation/core.md`, `mkdocs.yml`, `README.md`, `scripts/generate-service-docs.ts`, regenerated `docs/reference/services/*.md`, `tests/unit/docs-contract.test.ts`, and `tests/live/catalog.test.ts`.
- Expected performance gain: zero runtime delta (`0 ms`); eliminates documentation contradictions, fixes live catalog test contract bug, and reduces onboarding time.
- Publish-gate impact (`ADR-0003`): **none**. No changes to `src/` runtime behavior or publish verification logic.
