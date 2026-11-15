# Design

## Context

`src/core/` contains 3 direct mutual import cycles and two large orchestrator/normalizer files (`normalizer.ts` at 1,287 lines, `quote-file.ts` at 461 lines), while `scripts/check-boundaries.ts` currently only enforces CLI/MCP layer boundaries without checking relative module cycles inside `src/`.

## Goals / Non-Goals

**Goals:**
- Reduce module sizes and separate cohesive responsibilities cleanly across compiler normalization, quote-file planning/orchestration, and core UI/types.
- Achieve zero mutual/circular relative imports inside `src/`, enforced automatically by `bun run check:boundaries`.
- Maintain 100% behavioral and export equivalence across all 852 offline tests and compat fixtures.

**Non-Goals:**
- Changing normalization semantics, error messages, or option aliases.
- Introducing runtime performance optimizations inside this change (benchmarks are still run to confirm zero regression).

## Decisions

1. **Cycle removal strategy (`src/core/`)**:
   - `publish.ts ↔ types.ts`: Move `PublishPorts` interface (type-only interface) into `src/core/types.ts` (or a dedicated leaf types file) so `publish.ts` imports `ActionContext`/`PublishPorts` from `types.ts` with zero back-edge from `types.ts` to `publish.ts`.
   - `services/index.ts ↔ services/publication.ts`: Extract `builderDescriptions` / metadata lookup needed by `publication.ts` (or inject `supportedServices` / extract metadata into a leaf `services/catalog-meta.ts`) so `publication.ts` never imports `services/index.ts`.
   - `ui.ts ↔ views.ts`: Keep formatting primitives/helpers in `ui.ts` (or extract shared primitives to `format.ts`) and ensure `views.ts` depends unidirectionally on `ui.ts` (never `ui.ts` importing `views.ts`).

2. **Normalizer decomposition (`src/core/compiler/normalizer.ts` → `src/core/compiler/normalizer/`)**:
   - Split cleanly by responsibility: `aliases.ts` (`SERVICE_ALIASES`, `OS_MAP`, etc.), `helpers.ts` (string/number/size/storage token utilities), `split.ts` (`DEW`, `OBS`, `SINGLE_QUANTITY` card splitting), `compute-network.ts` / `storage-db.ts` / `middleware-services.ts` (per-service switch branches), with `src/core/compiler/normalizer.ts` acting as a thin barrel + entrypoint.
   - Preserve exact re-exports so zero external imports break.

3. **Quote-file decomposition (`src/core/quote-file.ts`)**:
   - Extract cohesive internal helpers (e.g., `lockfile.ts` for `readLock`/`writeLock`/`sortKeys` and `plan-rows.ts` or similar internal helpers) while preserving every exported symbol from `src/core/quote-file.ts` (`parse`, `validate`, `plan`, `apply`, etc.) and ensuring the top-level `draft → plan → apply → gate → publish` trace reads linearly.

4. **Cycle check in `scripts/check-boundaries.ts`**:
   - Parse static ES `import` / `export ... from` specifiers (both value and type imports, resolving `.ts` relative paths inside `src/`) and run DFS cycle detection; fail with explicit cycle chain (`a.ts -> b.ts -> a.ts`) if any cycle exists.

## Risks / Trade-offs

- Moving internal helpers can accidentally alter circular initialization or export paths; mitigated by keeping barrel re-exports intact, adding explicit cycle check tests, and running `bun run check && bun run check:boundaries && bun run test:offline`.

## Migration / Verification Plan

1. Verify baseline (`bun run check && bun run check:boundaries && bun run test:offline`).
2. Break the 3 cycles and enable cycle checking in `scripts/check-boundaries.ts`.
3. Split `normalizer.ts` and `quote-file.ts` keeping exact exports.
4. Run `bun run check`, `bun run check:boundaries`, `bun run test:offline`, `bun run bench`, and `bun run bench:report` (verifying zero regression vs baseline).
