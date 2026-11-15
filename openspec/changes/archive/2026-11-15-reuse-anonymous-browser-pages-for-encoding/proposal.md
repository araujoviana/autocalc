# Proposal

## Why

Encoding cards in the Playwright calculator page (`pagina`) represents **`69.30%` (`41,358.83 ms` of `59,683.06 ms`)** in `153-resources-multishard` offline and **`40.44%` (`33,317.30 ms` of `82,388.22 ms`)** in `10-resources` live (`bench/baseline.json`, `bench/baseline-live.json`). Today, every call to `encodeCard()` (`src/core/page/encode.ts:15`) calls `browser.withAnonymousContext(..., { lean: true })` (`src/core/browser.ts:47-56`), which allocates a cold Chromium `BrowserContext`, installs a new `page.route("**/*", ...)` filter, creates a page, encodes one card, and destroys the context.

Measured Fase 1 experiments (`browser_cold_context_overhead`) show that reusing a warm anonymous `BrowserContext + Page` across cards reduced 12 offline cards from **`2,703.48 ms` to `1,146.52 ms` (`-57.59%`)**, and reduced 3 live cards from **`20,911.02 ms` to `18,076.49 ms` (`-13.56%`, saving ~`0.94 s` per card)**.

## What Changes

- Add an exclusive-checkout anonymous slot pool (`withPooledAnonymousContext` or `{ reuse: true }` opt-in in `BrowserManager` in `src/core/browser.ts`, governed by proposed `ADR-0020`) for `lean` headless operations.
- Route `encodeCard()` (`src/core/page/encode.ts`) through the bounded pooled anonymous slot so worker slots reuse warm contexts sequentially across cards while concurrent encodes still hold strictly separate `BrowserContext`s (`ADR-0010`).
- Clear `localStorage`, `sessionStorage`, and cookies (and navigate to `about:blank` when reusing an active page) between sequential checkouts so zero cart state leaks from card `k` to card `k+1`.
- Discard and close any pooled slot that throws or triggers retry, recreating a clean context lazily on the next checkout; close all idle and active pooled contexts deterministically on `BrowserManager.close()`.
- Out of scope: sharing one context simultaneously across concurrent workers, changing `encodeWorkers()` default cap (`3`), reusing contexts when `headed` is true or in authenticated `withProfile()`, or modifying `verify()` / `gate.ts`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `huawei/page-encoding`: Permit sequential reuse of an idle anonymous browser context slot after clearing storage/cookies, while preserving strict concurrent context isolation and clean error disposal.

## Impact

- Code touched: `src/core/browser.ts`, `src/core/page/encode.ts`, and lifecycle/isolation unit + integration tests (`tests/integration/browser-lifecycle.test.ts`).
- Expected performance gain: up to **`-57.59%`** on offline `pagina` encode bursts and **`-13.56%` (`~0.94 s/card`)** on live `encodeCard` sequences (saving `~9–19 s` on 10–20 card live quotes and `~200 s` on 200-card shards).
- Publish-gate impact (`ADR-0003`): **none**. `encodeCard()` keeps all post-capture verifications (`newCartKey`, `rewriteMismatches`, region, and charge mode), and `verify()` / `publishChecked()` in `src/core/gate.ts` are untouched.
