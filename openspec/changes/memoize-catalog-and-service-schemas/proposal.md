# Proposal

## Why

During `plan()` (`src/core/quote-file.ts:172-260`) and `draftQuote()` (`src/core/quote/draft.ts:21-31`), each card triggers up to three separate `provider.candidates()` / `skus()` / `prices()` calls across `draftQuote`, `view` (`src/core/workflow.ts:18`), and `plan`. Each call hits `Catalog.productInfo`, `Catalog.labels`, and `Catalog.menu` (`src/core/catalog.ts:14-77`), re-reading JSON files from the disk `CatalogCache`, running `JSON.parse`, validating with Zod (`menuSchema`, `productSchema`), and running token regex substitution repeatedly within the same command invocation. Measured Fase 1 baselines show this accounts for `1,089.82 ms` vs `410.16 ms` with RAM memoization in 100 resources (`-62.36%`, `bench/baseline.json`) and `127.25 ms` vs `33.25 ms` in 10 live resources (`-73.87%`, `bench/baseline-live.json`), scaled to `3,011.01 ms` (`5.04%` offline) on `153-resources-multishard`.

Similarly, `validate()` (`src/core/quote-file.ts:84`) and `unmappedOptions()` (`src/core/quote-file.ts:103,185`) call `loadService()` (`src/core/schema-model.ts:35-40`) for every card without caching, re-reading and Zod-parsing `${service}.yaml` 213 times for 40 unique services (`44.44 ms` vs `3.78 ms`, `-91.49%`). Separately, `computeInputHash()` (`src/core/compiler/ir.ts:57-61`) passes `Object.keys(doc).sort()` as the `JSON.stringify` array replacer when serializing `{ doc, resources }`, dropping `resources` and nested properties from the SHA-256 hash.

## What Changes

- Add per-instance in-memory memoization (including in-flight deduplication) to `Catalog` (`src/core/catalog.ts`) for `menu`, `labels`, `productInfo`, and `skus` when `refresh === false`, bypassing and refreshing cached entries when `refresh === true`.
- Add in-memory memoization keyed by resolved `(dir, service)` in `loadService` (`src/core/schema-model.ts`), with explicit cache-clear helper for tests/tooling if needed.
- Fix `computeInputHash(doc, resources)` (`src/core/compiler/ir.ts:57-61`) with recursive deterministic key sorting across the full `{ doc, resources }` tree so resource mutations change `inputHash` while object key ordering stays canonical.
- Out of scope: changing the 24-hour disk `CatalogCache` TTL or disk serialization format, altering SKU ranking/scoring rules, optimizing pure compiler CPU (`18.00 ms` / `0.03%` for 213 cards), or touching browser encoding or publish verification.

## Capabilities

### New Capabilities

### Modified Capabilities

- `huawei/catalog`: Reuse parsed in-memory catalog entries within a `Catalog` instance across repeated reads unless `refresh` is set.
- `core/declarative-compiler`: Compute `inputHash` deterministically over both document metadata and normalized resources.

## Impact

- Code touched: `src/core/catalog.ts`, `src/core/schema-model.ts`, `src/core/compiler/ir.ts`, and unit tests.
- Expected performance gain: `-62%` to `-74%` on `plan()` / catalog lookup bursts (~`-1,800 ms` on 153-resource `normalizar` offline; eliminates redundant disk/Zod/regex work before browser stages in multi-resource quotes).
- Publish-gate impact: **none**. `verify()` (`src/core/gate.ts:86-137`) continues reading saved list details via `getUncached`, rating live via API, and running `editCheck` in the browser. Zero changes to saved-list wire format or `ADR-0003` checks.
