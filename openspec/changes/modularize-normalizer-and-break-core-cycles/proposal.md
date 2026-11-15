# Proposal

## Why

Fase 1 architectural analysis ([performance-diagnosis.md](../../../docs/research/performance-diagnosis.md#L173-L195)) identified structural obstacles that make the `draft → plan → apply → gate → publish` flow hard to navigate and maintain:

1. **Monolithic files:** `src/core/compiler/normalizer.ts` (`1,287` lines) mixes service alias tables, unit/token parsers, DEW/OBS/SINGLE_QUANTITY card-splitting logic, and a ~940-line `switch (service)` mapping block in one file. `src/core/quote-file.ts` (`461` lines) interleaves YAML parsing/lockfile I/O, schema validation helpers, `plan()` pricing anomaly detection, and multi-shard orchestration.
2. **Circular imports in `src/core/`:** three circular module pairs (`services/index.ts ↔ services/publication.ts`, `publish.ts ↔ types.ts`, `ui.ts ↔ views.ts`) complicate module initialization order and boundary reasoning, and `scripts/check-boundaries.ts` does not yet reject import cycles.

## What Changes

- Break all three circular dependencies inside `src/core/`:
  - Move or extract shared types/metadata (`supportedServices` / `builderDescriptions` or shared `ActionContext` / `PublishPorts` interface) so `services/index.ts` and `services/publication.ts`, `publish.ts` and `types.ts`, and `ui.ts` and `views.ts` form an acyclic dependency DAG.
- Extend `scripts/check-boundaries.ts` to detect and fail on relative import cycles inside `src/`.
- Split `src/core/compiler/normalizer.ts` (`1,287` lines) into focused submodules under `src/core/compiler/normalizer/` (aliases/OS maps, shared unit/disk helpers, card-splitting orchestration, and grouped service normalizers), keeping `src/core/compiler/normalizer.ts` as the barrel re-exporting identical public symbols (`normalizeResourceToCards`, etc.).
- Extract lockfile/validation/pricing sub-helpers out of `src/core/quote-file.ts` so the public pipeline `parse → validate → plan → apply` reads cleanly from top to bottom with identical exported API and behavior.
- Out of scope: altering any normalization mapping, changing quote/lockfile schemas, changing runtime concurrency/caching logic (handled by Changes 1–3), or changing `src/cli.ts` / `src/mcp.ts` user surfaces.

## Capabilities

### New Capabilities

### Modified Capabilities

- `dev-quality`: Enforce cycle-free module imports within `src/` as part of the boundary check in the CI gate.

## Impact

- Code touched: `src/core/compiler/normalizer.ts`, `src/core/compiler/normalizer/*`, `src/core/quote-file.ts` + extracted helper module(s), `src/core/services/{index,publication}.ts`, `src/core/{publish,types,ui,views}.ts`, and `scripts/check-boundaries.ts`.
- Expected performance gain: negligible runtime delta (`~0 ms`); primary payoff is maintainability, clear `draft → plan → apply → gate → publish` code navigation, and lower risk before/after concurrency changes.
- Publish-gate impact (`ADR-0003`): **none**. Pure structural refactor; `src/core/gate.ts`, `src/core/page/*`, and all normalization outputs remain bit-for-bit identical under the full offline unit, integration, and compat suites.
