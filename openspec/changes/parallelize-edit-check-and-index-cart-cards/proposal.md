# Proposal

## Why

In live quotations against the Huawei Cloud portal, `editCheckOnce()` (`src/core/page/edit.ts:114-130`) is the **single largest bottleneck**, taking **`42,042.39 ms` (`51.03%`)** of a 10-resource quote (`bench/baseline-live.json`) and **`15,034.91 ms` (`25.19%`)** of the offline `153-resources-multishard` scenario (`bench/baseline.json`). The bottleneck has two causes:

1. `editCheckOnce()` opens one anonymous browser context and checks every saved card strictly sequentially (`for (const [index, card] of cards.entries())` at `src/core/page/edit.ts:127`), accumulating real portal navigation + form refill + `quiet = 1.5s` settle delays (`src/core/page/driver.ts:61`) card after card. Live Fase 1 tests measured **`21,999.09 ms` (`-47.67%`, `1.91×` speedup)** when distributing 10 real cards across 3 staggered parallel anonymous contexts, and offline Fase 1 tests measured **`2,559.43 ms` vs `6,962.77 ms` (`-63.24%`, `2.72×` speedup)** across 100 cards in 4 contexts.
2. Inside the Vue store bridge (`src/core/page/store.ts:149-155`), `tagCard(key)` clones and `JSON.stringify`s every `collapse-card-item`'s `sourceData` on every card lookup ($O(N^2)$ across large lists).

Additionally, live measurements showed that launching 3 cold contexts on `share.html` at the exact same millisecond (`t = 0`) stalls Vue's 61-script mount (`templates: 0`), whereas staggering remote context opens (e.g., `1,500 ms` per worker) + 1 retry on `openFailed` eliminates that cold-boot failure.

## What Changes

- Index/match `collapse-card-item` cards directly by `_cartId` property in `tagCard(key)` (`src/core/page/store.ts:149-155`) before any fallback string match, avoiding repeated `JSON.stringify(plain(...))` across all cards on every lookup.
- Add bounded parallel `editCheck` execution in `src/core/page/edit.ts` across disjoint card slices in isolated anonymous `BrowserContext`s (`ADR-0010`, proposed `ADR-0020`), controlled by `editWorkers()` (`AUTOCALC_EDIT_WORKERS`, default conservatively capped at `3`, valid `1..16`, `1` when single-card).
- Stagger worker initial navigation on remote (`https://`) URLs and retain `openFailed` single retry per slice (before any price comparison begins), reassembling `EditResult[]` deterministically sorted by original `0..N-1` card `index`. Never retry a card price/form mismatch.
- Document `AUTOCALC_EDIT_WORKERS` in `docs/reference/cli.md` (satisfying `tests/unit/docs-contract.test.ts`).
- Out of scope: altering `checkCard` price comparison semantics, shortening `driver.ts` `quiet = 1.5s`, sharing a browser context across concurrent Edit workers, or reusing `BrowserContext` slots for `encodeCard` (covered in a separate OpenSpec change).

## Capabilities

### New Capabilities

### Modified Capabilities

- `huawei/page-encoding`: Allow multi-card `editCheck` to verify disjoint card slices across bounded parallel isolated browser contexts in deterministic card order.
- `huawei/publish-gate`: Explicitly confirm fail-closed behavior and deterministic per-card error reporting when a parallel Edit slice fails to open or fails verification.

## Impact

- Code touched: `src/core/page/edit.ts`, `src/core/page/store.ts`, `docs/reference/cli.md`, and unit/integration tests.
- Expected performance gain: **`-47.67%` (`42,042.39 ms → 21,999.09 ms`)** on 10-card live `editCheck` (~`-24%` end-to-end on live 10-card quotes), and **`-63.24%` (`6,962.77 ms → 2,559.43 ms`)** on 100-card offline `editCheck`.
- Publish-gate impact (`ADR-0003`): **none — fail-closed parity preserved 100%**. Every card `0..N-1` runs the identical `checkCard()` logic inside an isolated anonymous context; `publishChecked()` (`src/core/gate.ts:174-188`) validates exact unique `indices` covering `0..cards.length-1`, rejects on any `cardOk === false` or thrown slice error, deletes the remote list (unless `AUTOCALC_KEEP_ON_FAIL=1`), and raises `GATE_FAILED` in deterministic list order.
