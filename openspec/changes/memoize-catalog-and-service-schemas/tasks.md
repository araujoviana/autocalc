# Tasks

## 1. Pre-change baseline

- [ ] 1.1 Verify clean baseline before code edits; confirm `bench/baseline.json` exists and run `bun run test:offline`.

## 2. In-memory memoization in `Catalog` and `loadService`

- [ ] 2.1 Add per-instance in-memory promise/value memoization with `refresh` invalidation and failed-promise eviction in `src/core/catalog.ts` (`menu`, `labels`, `productInfo`, `skus`); verify with unit tests asserting transport `get()` is called once across repeated non-refresh `skus()` calls and refreshed when `refresh = true`.
- [ ] 2.2 Memoize `loadService(service, dir)` by `(resolve(dir), service)` in `src/core/schema-model.ts` with failed-read eviction for non-existent paths only as safe; verify with unit tests reading the same service schema twice from a temporary directory without extra disk reads after initial load and preserving distinct directories (`bun test tests/unit/`).

## 3. Deterministic `computeInputHash` fix

- [ ] 3.1 Fix `computeInputHash(doc, resources)` in `src/core/compiler/ir.ts` using recursive deterministic key sorting over `{ doc, resources }`; verify with unit tests asserting key-order invariance and sensitivity to resource option/quantity edits (`bun test tests/unit/compiler/`).

## 4. Regression & benchmark verification

- [ ] 4.1 Run `bun run check && bun run check:boundaries && bun run test:offline` and verify zero failures and zero type/boundary errors.
- [ ] 4.2 Run `bun run bench` and `bun run bench:report` and verify measurable latency reduction on `plan_disk_cache_zod`, `schema_yaml_uncached`, and `normalizar` in `bench/dashboard.html` with identical `plan` output across `tests/integration/business-scenarios.test.ts`.
