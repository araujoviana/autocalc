# Tasks

## 1. Cycle removal and automated cycle guard

- [ ] 1.1 Break the 3 circular imports in `src/core/` (`services/index.ts ↔ services/publication.ts`, `publish.ts ↔ types.ts`, `ui.ts ↔ views.ts`) without altering public exports; verify `bun run check && bun run test:offline` passes.
- [ ] 1.2 Extend `scripts/check-boundaries.ts` to detect relative import cycles across `src/` and add unit test coverage for cycle detection; verify `bun run check:boundaries` passes with 0 cycles reported.

## 2. Decompose `normalizer.ts` and `quote-file.ts`

- [ ] 2.1 Split `src/core/compiler/normalizer.ts` into cohesive submodules under `src/core/compiler/normalizer/` while preserving all exported symbols from `src/core/compiler/normalizer.ts`; verify `bun test tests/unit/compiler/ tests/integration/business-scenarios.test.ts` passes cleanly.
- [ ] 2.2 Extract lockfile/auxiliary helpers out of `src/core/quote-file.ts` so `parse → validate → plan → apply` reads linearly with identical public exports; verify `bun test tests/unit/ tests/integration/` passes completely.

## 3. Final verification & benchmark regression check

- [ ] 3.1 Run `bun run check && bun run check:boundaries && bun run test:offline` and confirm zero errors or test failures.
- [ ] 3.2 Run `bun run bench` and `bun run bench:report` and verify zero performance regression across offline scenarios vs `bench/baseline.json`.
