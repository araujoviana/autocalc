# Design

## Context

`scripts/bench.ts` (`bench/baseline.json` and `bench/baseline-live.json`) isolated two I/O and validation bottlenecks that execute during planning and validation before any Playwright page opens:
- `plan_disk_cache_zod`: `1,089.82 ms` (p95 `1,110.82 ms`) down to `410.16 ms` (p95 `412.69 ms`, `-62.36%`) on `100-resources` offline, and `127.25 ms` down to `33.25 ms` (`-73.87%`) on `10-resources` live.
- `schema_yaml_uncached`: `44.44 ms` (p95 `46.40 ms`) down to `3.78 ms` (p95 `3.97 ms`, `-91.49%`) across 213 cards / 40 unique services.

Inspecting `src/core/compiler/ir.ts:57-61` also revealed `JSON.stringify({ doc, resources }, Object.keys(doc).sort())`, where the array replacer filters out `"doc"` and `"resources"`, collapsing `inputHash` across resource edits.

## Goals / Non-Goals

**Goals:**
- Deduplicate concurrent and sequential `menu()`, `labels()`, `productInfo()`, and `skus()` reads per `Catalog` instance when `refresh` is false.
- Deduplicate `loadService()` YAML reads and `ServiceSchema.parse` per `(dir, service)` pair.
- Guarantee `computeInputHash(doc, resources)` incorporates all fields of both `doc` and `resources` deterministically.

**Non-Goals:**
- Persisting compiled binary/JSON service schemas on disk.
- Modifying `CatalogCache` on-disk 24h TTL behavior or invalidating caches across separate CLI processes.
- Rewriting `plan()` candidate/ranking logic.

## Decisions

1. **Memoize inside `Catalog` (`src/core/catalog.ts`) rather than adding a stateful global transport cache.**
   - `Catalog` instances live for the lifecycle of one CLI invocation, MCP server session, or benchmark run (`createCore()`). Storing `Map<string, Promise<...>>` for `menu`, `labels`, `productInfo`, and `skus` keyed by `(language)` or `(service, region)` deduplicates concurrent `Promise.all` calls as well as the 3× sequential passes in `draftQuote` → `view` → `plan`.
   - When `refresh = true`, delete/overwrite the corresponding in-memory entries (including matching `(service, region)` or `all` `skus` entries) and await fresh `transport.get(..., { refresh: true })`.
   - On rejection, remove the rejected promise from the map so transient network/disk errors can be retried cleanly.

2. **Memoize `loadService()` by `(resolve(dir), service)` in `src/core/schema-model.ts`.**
   - Service YAML schemas under `src/schema/files/*.yaml` are static committed assets in normal runs. Keying an in-memory `Map<string, Promise<ServiceSchema | null>>` by normalized directory and service name prevents cross-directory test leakage while accelerating `validate()` and `unmappedOptions()`.
   - Return immutable or cloned objects only if callers mutate; inspect `validate()` / `unmappedOptions()` / tests to ensure callers treat loaded `ServiceSchema` as read-only (freeze or clone if necessary, or confirm read-only usage).

3. **Canonical recursive key sort in `computeInputHash()` (`src/core/compiler/ir.ts:57-61`).**
   - Replace the broken `Object.keys(doc).sort()` replacer with a recursive canonicalizer (`sortJson` helper handling plain objects, arrays, and primitives) before hashing `{ doc, resources }`.

## Risks / Trade-offs

- Long-lived `autocalc mcp` processes share one `Catalog` instance until restart; callers needing fresh pricing pass `refresh: true` (already exposed on catalog actions), and existing TTL still applies when a fresh process starts.
- Fixing `computeInputHash` changes the computed hash string compared to the broken `"{}"` hash; check existing unit tests on `computeInputHash` / `ir` / `lockfile` and update expectations if any asserted the buggy hash, documenting the fix.

## Migration / Verification Plan

1. Record offline and live baseline before edits (`bench/baseline.json`, `bench/baseline-live.json`).
2. Implement `Catalog` memoization, `loadService` memoization, and `computeInputHash` fix with targeted unit tests (including `refresh: true` cache bypass and resource-change hash invalidation).
3. Run `bun run check`, `bun run check:boundaries`, `bun run test:offline`, `bun run bench`, and `bun run bench:report`, attaching delta comparisons for `plan_disk_cache_zod`, `schema_yaml_uncached`, and `normalizar`.
