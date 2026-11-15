# Design

## Context

- `editCheckOnce()` (`src/core/page/edit.ts:114-130`) currently opens one anonymous `BrowserContext` and verifies all `N` cards sequentially.
- [ADR-0003](../../../docs/adr/0003-fail-closed-publish-gate.md) and [ADR-0010](../../../docs/adr/0010-concurrency-by-state.md) explicitly envision running isolated `editCheck` contexts in parallel; [ADR-0020](../../../docs/adr/0020-bounded-browser-context-pool-and-staggered-edit-check.md) records the staggered remote open policy after Fase 1 live experiments proved un-staggered 3× simultaneous opens on `share.html` stall `<template-render>` mounting (`templates: 0`, `scripts: 61`), whereas `1.5s` stagger + 1 retry on `openFailed` succeeded in `21,999.09 ms` vs `42,042.39 ms` (`-47.67%`).
- `tagCard(key)` in `src/core/page/store.ts:149-155` runs `JSON.stringify(plain(i.props.sourceData || {})).includes(key)` across every `collapse-card-item` on every card check ($O(N^2)$).

## Goals / Non-Goals

**Goals:**
- Reduce live and offline `edit` stage duration proportionally to worker count without altering any card check outcome or order.
- Eliminate unnecessary `JSON.stringify(plain(...))` allocations inside `tagCard()`.
- Preserve strict isolated contexts per concurrent worker (`localStorage` safety, ADR-0010) and strict fail-closed `GATE_FAILED` deletion on any slice/card error (ADR-0003).

**Non-Goals:**
- Sharing one `BrowserContext` across concurrent Edit workers.
- Changing `checkCard()` verification rules, `Driver.settle()` `quiet = 1.5s`, or `AUTOCALC_DEFER_EDIT`.

## Decisions

1. **Bounded worker slicing (`editWorkers()` in `src/core/page/edit.ts`)**:
   - Validate `AUTOCALC_EDIT_WORKERS` (`1..16`, throwing `VALIDATION` if invalid, matching `encodeWorkers()` in `src/core/publish.ts:32-40`); default to `Math.min(encodeWorkers(), cards.length)` (at most `3` by default) or `1` when `cards.length <= 1` (or `cards.length <= 2` if desirable; keep `Math.min(workers, cards.length)`).
   - Partition `cards.entries()` into `W` round-robin or contiguous disjoint slices (preserving `(index, card)` pairs). Round-robin or balanced chunking keeps workers balanced even if heavy services (e.g., ECS/CCE) cluster in the YAML order; sort final aggregated `EditResult[]` ascending by `index`.

2. **Staggered initial opens & `openFailed` 1-retry per slice (never retry card mismatches)**:
   - On remote targets (`!shareUrl.startsWith("http://127.0.0.1")` && `!shareUrl.startsWith("http://localhost")`), delay worker `k > 0` start by `k * 1500` ms (`editDelayMs` option injectable in tests so offline tests run with `0` ms delay).
   - Keep `openFailed` 1-retry semantics from `src/core/page/edit.ts:109-110` per worker slice: only if opening the page / clicking `"View Details"` fails before checking any card, retry that slice once in a fresh anonymous context. Once cards start checking, NEVER retry a card failure or mismatch.

3. **Direct `_cartId` lookup in `tagCard(key)` (`src/core/page/store.ts:149-155`)**:
   - Inspect `i.props.sourceData`: check `s && (s._cartId === key || (s.selectedProduct && s.selectedProduct._cartId === key))` first, only falling back to serialized string search when `_cartId` is absent. Avoid calling `plain()` (`JSON.parse(JSON.stringify(...))`) inside the predicate loop.

## Risks / Trade-offs

- **Risk: Parallel open burst on live portal CDN/API.** Mitigated by capping default workers at `<= 3` (`encodeWorkers()` budget) and staggering remote worker starts (`1.5s * k`).
- **Risk: Cancellation/partial worker failure.** Use `Promise.all` across slices; any slice open failure after 1 retry marks all cards in its slice as `{ equal: false, edit: null, reason }` (`openFailed`), ensuring `publishChecked()` sees `!allOk` and deletes the saved list deterministically. Unexpected non-`PAGE_ENCODE_FAILED` exceptions propagate cleanly so `publishChecked()` triggers list deletion in its error path (`src/core/gate.ts:176-188`).

## Migration / Verification Plan

1. Add unit tests for `AUTOCALC_EDIT_WORKERS` validation, deterministic `0..N-1` result reassembly with out-of-order slice completion, fail-closed propagation when 1 slice fails `openFailed` twice or fails 1 card, and `tagCard` direct `_cartId` matching.
2. Run `bun run check && bun run check:boundaries && bun run test:offline`.
3. Run `bun run bench` and `bun run bench:report` (plus optional targeted live verification if user authorizes live run in Fase 3) and confirm `edit` speedup vs `bench/baseline.json`.
