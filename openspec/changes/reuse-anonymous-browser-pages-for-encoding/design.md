# Design

## Context

`BrowserManager.withAnonymousContext` (`src/core/browser.ts:47-56`) creates and closes a new Chromium `BrowserContext` per call. While essential to isolate `localStorage` between **concurrent** operations ([ADR-0010](../../../docs/adr/0010-concurrency-by-state.md)), discarding the context after **each** single card inside a 10-card to 200-card quote repeats Chromium context creation, route registration, and HTTP cache cold-boot overhead per card.

## Goals / Non-Goals

**Goals:**
- Reuse warm headless `{ context, page }` anonymous slots sequentially across cards within bounded worker concurrency.
- Enforce zero cart leakage between cards checked out sequentially on the same slot.
- Dispose pooled contexts cleanly on error, cancellation, or `BrowserManager.close()`.

**Non-Goals:**
- Never share a single `BrowserContext` concurrently between two active workers (`ADR-0010`).
- No pooling when `headed` is true (`options.headed`) or when custom non-lean options require clean isolation.
- Do not hold pooled contexts across idle CLI commands (each CLI/benchmark command closes its `BrowserManager` at shutdown).

## Decisions

1. **Exclusive checkout model in `BrowserManager` (`src/core/browser.ts`)**:
   - Maintain a small idle stack of `{ context, page }` slots created under `{ viewport: { width: 1366, height: 900 }, locale: "en-US" }` with `lean` routing enabled once per context.
   - `acquire()` pops an idle slot (or creates a new one if none is idle) so two concurrent `encodeCard()` callers never hold the same `BrowserContext`.
   - Before releasing an idle slot back for reuse: reset `page` state by navigating to `about:blank` if needed, clearing `context.clearCookies()`, and wiping `localStorage`/`sessionStorage` on the calculator origin before/upon reuse (e.g., resetting via an `addInitScript` on context creation + explicit evaluate wipe when leaving a loaded calculator document before returning to `idle`). Actually, clearing storage **before returning** (`page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} })` -> `await page.goto("about:blank")` -> `await context.clearCookies()`) guarantees `cartListDataBase` is gone before the context even sits in the idle pool, AND `context.addInitScript` or post-open check provides defense in depth if needed — even simpler: `storage` is cleared on exit before returning the slot to `idle`!
   - **Zero-trust on error or retry:** If the operation throws (e.g., `PAGE_ENCODE_FAILED` or navigation timeout) OR if `this.closed` became true while checked out, destroy (`await context.close()`) instead of returning the slot to `idle`, ensuring corrupt/mid-flight SPA state never poisons subsequent cards. Also discard when retries happen in `encodeCard()` (`src/core/page/encode.ts:28-38`) by calling `withAnonymousContext` freshly on error or letting each `withPooledAnonymousContext` checkout wrap one attempt cleanly (actually, putting `encodeOnce` inside a pooled checkout means an error closes that slot automatically, and the next retry attempt acquires a brand-new context!).

2. **Bounded idle capacity (`maxIdle = 4`) & clean close (`BrowserManager.close()`)**:
   - Cap `idle` pool size (default `4`, matching typical bounded workers) so excess contexts returned from burst calls close immediately rather than holding RAM indefinitely.
   - `close()` flips `this.closed = true`, immediately closes all idle contexts, waits for active checkouts to finish/abort on shutdown, closes remaining contexts + `browser.close()`, matching `tests/integration/browser-signals.test.ts` and `browser-lifecycle.test.ts`.

## Risks / Trade-offs

- **Risk: Residual Vue cart state across cards on the same pooled context.** Mitigated by clearing `localStorage`, `sessionStorage`, `cookies`, navigating to `about:blank` on release, keeping `encode.ts`'s `newCartKey(before, after)` check intact, and testing back-to-back encodes explicitly in unit/integration tests.
- **Risk: Chromium memory growth across 200+ cards.** Mitigated by recycling a slot after a bounded number of uses (e.g., `MAX_SLOT_USES = 25`) and capping idle slots.

## Migration / Verification Plan

1. Add integration test verifying back-to-back pooled encodes have empty initial cart (`cartKeys().length === 0`), concurrent pooled encodes still get distinct contexts, failed checkouts close the dirty context instead of recycling it, and `close()` reaps all pooled contexts on shutdown.
2. Run `bun run check`, `bun run check:boundaries`, `bun run test:offline`, `bun run bench`, and `bun run bench:report`.
