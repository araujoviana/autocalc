# Project status

Last updated 2026-11-07. This page is the starting point
for whoever picks the work up; the detail lives in the pages it links.

## Where things stand

The implementation is TypeScript on Bun (v0.2.0, [ADR-0017](adr/0017-typescript-on-bun-is-the-target.md)).
All three layers of the declarative design exist and are covered by the offline suite
([architecture](explanation/architecture.md)):

| Layer | State |
|---|---|
| Declarative (`src/core/compiler/`) | Implemented and tested: units, templates, expander, normalizer, canonical IR, lock file, wire budgeting, partitioning, logical-to-physical card splitting, and all 4 circuit-breaker degradation tiers (`FULL_GATE_VERIFIED`, `RATING_VERIFIED_EDIT_SKIPPED`, `CACHED_CATALOG_ESTIMATE`, `EXPORT_ONLY`). The catalog anomaly guard flags yearly cards in `plan-quote` |
| Canonical (`src/core/quote/`, `quote-file.ts`) | Implemented: ranking, drafts, run records, plan and apply across both legacy `cards:` and declarative `version: "1"` quote files |
| Vendor (`src/providers/`, `src/core/page/`, `gate.ts`, `src/schema/`) | Implemented: catalog, rating, page encoder, 100% mapped schemas across all 40 committed service files, publish gate |

## What has been checked live

- **All 51 supported services (`docs/compat/*.md`)**: Every supported service across Tiers 1–5 (16 IaaS compute/storage/network + 4 default-only IaaS/network, 4 Tier 2 containers/serverless, 11 Tier 3 databases, and 16 Tier 4–5 security/middleware/management/AI services) has been replayed live against the Huawei Cloud calculator page (`bun run compat <service>`) with **0 failures**.
- **20 real-world business architecture YAML scenarios (`tests/fixtures/scenarios/01-*.yaml`..`20-*.yaml`)**: Validate, plan, and build form cards across all 40 verified publishable Huawei Cloud services (`tests/integration/business-scenarios.test.ts`).
- **End-to-end authenticated gate (`plan-quote` / `apply-quote`)**: Verified live on single-card and `version: "1"` declarative quotes (stored = rated = Edit), plus live Edit verification across ECS, EVS, RDS, Redis, NAT, OBS (known-defect skip), Kafka, SFS, SDRS, DES, DSS, ER, Memcached, DRS, DDM, DDS, GaussDB, RDS for MariaDB, TaurusDB, and HRDS.

## What remains open

- Saving a large declarative quote that partitions into multiple saved lists (`Part 1`, `Part 2`, ...) on a live authenticated account.
- Extending `VERIFIED` publication beyond the 40 verified services to the remaining 11 `ACCEPTED_DEFAULT_ONLY` / unmapped-add-on services (`hcss`, `vpcep`, `vpn`, `cce-autopilot`, `cci`, `swr`, `functiongraph`, `ssa`, `dbss`, `dsc`, `aad`) once their custom option/add-on mappings and authenticated Edit-check prices are verified.
- Post-0.9 items in [the roadmap](roadmap.md): whole-list billing-mode comparison, gated in-place update of a saved list, and list naming/prune helpers.

## Run an end-to-end check

```bash
autocalc login                                  # once
autocalc plan-quote  --path quote.yaml          # saves nothing on the website
autocalc apply-quote --path quote.yaml          # saves one list; delete test lists afterwards
```

Use a list name that starts with `[autocalc]` so test lists are easy to find in `autocalc lists`.
See [Your first quote](tutorials/first-quote.md) for the file format.

## Compatibility

Per-service live replay results are in `docs/compat/` (`bun run compat <service>`). All 51 supported services across Tiers 1–5 (IaaS compute/storage/network, containers/serverless, databases, security, middleware, management, and AI) have been replayed live and pass (`ok`) across all scenarios. All 40 committed service schemas (`src/schema/files/*.yaml`) are at 100% control coverage, and 20 multi-service business architecture YAML scenarios (`tests/fixtures/scenarios/01-*.yaml`..`20-*.yaml`) validate, plan, and build form cards across all 40 publishable services.
