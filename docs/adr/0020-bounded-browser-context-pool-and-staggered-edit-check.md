---
status: proposed
date: 2026-11-14
---

# Bounded anonymous browser context pool for encoding and staggered parallel Edit checks

## Context and Problem Statement

Fase 1 measurements (`bench/baseline.json` on offline loopback and `bench/baseline-live.json` on the live Huawei Cloud calculator) establish that Playwright browser phases (`pagina` + `edit`) account for **94.49%** of offline end-to-end runtime (`41,358.83 ms` + `15,034.91 ms` of `59,683.06 ms` in `153-resources-multishard`) and **91.47%** of live end-to-end runtime (`33,317.30 ms` + `42,042.39 ms` of `82,388.22 ms` in `10-resources`). Meanwhile, [ADR-0001](0001-page-as-encoder.md) requires driving the real page to encode cards, [ADR-0003](0003-fail-closed-publish-gate.md) requires an identical fail-closed Edit verification on every card, and [ADR-0010](0010-concurrency-by-state.md) constrains concurrency by state: parallel reads, isolated browser contexts for form filling/Edit checks, and strictly sequential account writes.

Two concrete bottlenecks exist inside those browser phases under current code:

1. **Sequential `editCheck` loop (`src/core/page/edit.ts:114-127`)**: Although [ADR-0003](0003-fail-closed-publish-gate.md) (`L36-37`) and [ADR-0010](0010-concurrency-by-state.md) (`L34`) allow isolated browser contexts in parallel for Edit checks, `editCheckOnce` opens a single anonymous page and verifies all `0..N-1` cards sequentially (`42,042.39 ms` = `51.03%` of a live 10-resource quote; `6,962.77 ms` isolated for 100 offline cards). Live experiments also showed that launching 3 cold anonymous contexts simultaneously on `share.html` at `t = 0` stalls Vue `<template-render>` initialization (`templates: 0`, `scripts: 61`), whereas staggering remote context opens by `1,500 ms` per worker + 1 retry on `openFailed` reduces 10-card live `editCheck` from `42,042.39 ms` to **`21,999.09 ms`** (`-47.67%`, `1.91×` speedup) with identical fail-closed verification across all 10 cards (and `-63.24%` / `2.72×` across 100 offline cards).
2. **Cold `BrowserContext` per encoded card (`src/core/page/encode.ts:15`, `src/core/browser.ts:47-56`)**: `encodeCard` creates and destroys a fresh `BrowserContext` and `.route("**/*")` handler for every single card. On local loopback this saturates at `1.23×` with 4 workers, whereas reusing a warm `BrowserContext + Page` slot reduced 12 offline cards by **`-57.59%`** (`2,703.48 ms` → `1,146.52 ms`) and 3 live cards by **`-13.56%`** (`20,911.02 ms` → `18,076.49 ms`, `~0.94 s/card`).

How should autocalc speed up `encode` and `editCheck` while keeping cart state isolated (`localStorage`), avoiding cold-boot stalls on the live portal, and preserving [ADR-0003](0003-fail-closed-publish-gate.md) invariants?

## Decision Drivers

* Preserve fail-closed publish gate semantics ([ADR-0003](0003-fail-closed-publish-gate.md)): deterministic `0..N-1` card order, exact amount and `rewriteValue` verification, and automatic deletion of failed lists.
* Prevent cross-card cart contamination ([ADR-0010](0010-concurrency-by-state.md)): the calculator stores cart state in `localStorage`.
* Prevent simultaneous 61-script Vue cold-boot stalls observed on live `share.html` when multiple cold contexts open at `t = 0`.
* Maintain cross-platform parity on Windows and Linux ([ADR-0012](0012-windows-and-linux.md)) and clean resource disposal on shutdown.

## Considered Options

* Keep `encodeCard` cold per card and `editCheckOnce` sequential (status quo).
* Share browser tabs inside a single persistent context concurrently.
* Bounded parallel `editCheck` in isolated `BrowserContext`s with remote open staggering, plus an exclusive-checkout warm anonymous slot pool in `BrowserManager` for `encodeCard`.

## Decision Outcome

Chosen option: **bounded parallel `editCheck` across isolated `BrowserContext`s with remote open staggering, plus an exclusive-checkout warm anonymous `{ context, page }` pool for sequential reuse within worker slots**.

1. **Parallel `editCheck` across disjoint card slices (`src/core/page/edit.ts`)**:
   * Partition cards into disjoint slices checked concurrently in separate isolated `BrowserContext`s, bounded by `editWorkers()` (`AUTOCALC_EDIT_WORKERS`, default capped conservatively at `3`, configurable `1..16`, `>=1`).
   * On remote `https://` targets, stagger initial worker navigation (e.g., `1,500 ms * workerIndex`) so concurrent contexts do not hit cold 61-script Vue initialization at the exact same instant; retain 1 retry per slice on `openFailed` before any price comparison begins (never retry a price mismatch or card failure).
   * Reassemble `EditResult[]` deterministically by original card `index` (`0..N-1`). Any thrown worker error or missing card propagates cleanly to `publishChecked()` so [ADR-0003](0003-fail-closed-publish-gate.md) fail-closed deletion behaves identically to sequential mode.
2. **Exclusive-checkout warm anonymous slot pool (`src/core/browser.ts`, `src/core/page/encode.ts`)**:
   * Add a bounded pool of reusable `{ context, page }` anonymous headless (`lean`) slots in `BrowserManager`.
   * A slot is checked out exclusively by at most one `encodeCard` call at a time; concurrent encodes NEVER share a context simultaneously ([ADR-0010](0010-concurrency-by-state.md)).
   * Before returning an idle slot for the next card, clear `localStorage`, `sessionStorage`, and cookies and reset navigation so no cart item leaks between cards.
   * If any checked-out operation throws (or `capture` retries), destroy that slot instead of returning it to the pool and recreate a clean context on the next checkout.
   * Dispose all pooled contexts cleanly on `BrowserManager.close()`.
3. **Keep account writes (`createOrFind`, `delete`) strictly sequential per shard ([ADR-0010](0010-concurrency-by-state.md)).**

### Consequences

* **Good:** Eliminates the dominant sequential `editCheck` latency (`-47.67%` measured live, `-63.24%` offline) and eliminates per-card cold context setup (`-57.59%` offline, `-13.56%` live) with identical card-by-card gate fidelity.
* **Good:** Remote staggering avoids simultaneous 61-script SPA cold-boot timeouts on live `share.html`.
* **Neutral / Risk:** Reused contexts carry residual V8 heap across cards inside a single publish run; mitigated by bounding pool capacity to `encodeWorkers()` (`<= 3` by default), clearing storage between uses, discarding errored slots, and tearing down all pooled contexts on `BrowserManager.close()`.
