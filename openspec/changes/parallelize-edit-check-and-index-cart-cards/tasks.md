# Tasks

## 1. Pre-change baseline

- [x] 1.1 Verify offline baseline in `bench/baseline.json` and confirm `bun run test:offline` passes before editing.

## 2. Vue card lookup optimization & parallel Edit check

- [x] 2.1 Optimize `tagCard(key)` in `src/core/page/store.ts` to check `sourceData?._cartId` / `sourceData?.selectedProduct?._cartId` directly without double-serializing via `plain()` + `JSON.stringify()`; verify existing page-bridge unit tests pass (`bun test tests/unit/`).
- [x] 2.2 Implement `editWorkers()` (`AUTOCALC_EDIT_WORKERS`, `1..16`, default `<= 3`) and disjoint slice parallelization in `src/core/page/edit.ts` using isolated anonymous contexts, remote open staggering, 1-retry strictly on `openFailed`, and index-sorted `EditResult[]` output; verify with unit tests covering out-of-order completion, invalid `AUTOCALC_EDIT_WORKERS` rejection, single-slice `openFailed` failure propagation, and gate deletion parity (`bun test tests/unit/ tests/integration/publish-failure-matrix.test.ts`).

## 3. CLI reference & verification

- [x] 3.1 Document `AUTOCALC_EDIT_WORKERS` in `docs/reference/cli.md`; verify `bun test tests/unit/docs-contract.test.ts` passes.
- [x] 3.2 Run `bun run check && bun run check:boundaries && bun run test:offline` and verify zero errors or failures.
- [x] 3.3 Run `bun run bench` and `bun run bench:report` and verify measured reduction on `edit` (`edit_check_sequential` and multi-card scenarios) in `bench/dashboard.html`.
