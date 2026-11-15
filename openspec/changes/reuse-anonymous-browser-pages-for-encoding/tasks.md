# Tasks

## 1. Pre-change baseline

- [ ] 1.1 Confirm baseline `bench/baseline.json` / `bench/baseline-live.json` and verify `bun run test:offline` passes before edits.

## 2. Pooled anonymous context slot manager & encoder wiring

- [ ] 2.1 Implement bounded exclusive-checkout anonymous context/page pool in `src/core/browser.ts` (`lean` headless mode only, storage+cookie wipe + `about:blank` reset on clean return, `MAX_SLOT_USES` cap, immediate context disposal on error or shutdown); verify with integration tests in `tests/integration/browser-lifecycle.test.ts` proving concurrent isolation, clean sequential cart reset, error disposal, and clean `close()` / `browser-signals` shutdown.
- [ ] 2.2 Wire `encodeCard()` retry attempts in `src/core/page/encode.ts` to use one pooled checkout per attempt so clean retries get a fresh context while clean cards reuse warm slots; verify with unit tests in `tests/unit/` and integration tests confirming cart isolation (`newCartKey`) and `PAGE_ENCODE_FAILED` failure handling remain identical.

## 3. Verification & benchmark delta

- [ ] 3.1 Run `bun run check && bun run check:boundaries && bun run test:offline` and confirm zero errors or test failures.
- [ ] 3.2 Run `bun run bench` and `bun run bench:report` and verify measurable reduction in `browser_cold_context_overhead` and `pagina` stage across multi-card scenarios in `bench/dashboard.html`.
