# Project status

Last updated 2026-11-04, at the end of the TypeScript migration. This page is the starting point
for whoever picks the work up; the detail lives in the pages it links.

## Where things stand

The implementation is TypeScript on Bun (v0.2.0, [ADR-0017](adr/0017-typescript-on-bun-is-the-target.md)).
All three layers of the declarative design exist and are covered by the offline suite
([architecture](explanation/architecture.md)):

| Layer | State |
|---|---|
| Declarative (`src/core/compiler/`) | Implemented and tested offline: units, templates, expander, canonical IR, lock file, wire budgeting, partitioning. The circuit breaker (`circuit-breaker.ts`) is wired into the gate for known vendor defects; its catalog anomaly guard flags yearly cards in `plan-quote` |
| Canonical (`src/core/quote/`, `quote-file.ts`) | Implemented: ranking, drafts, run records, plan and apply |
| Vendor (`src/providers/`, `src/core/page/`, `gate.ts`, `src/schema/`) | Implemented: catalog, rating, page encoder, generated schemas, publish gate |

## What has been checked live

On 2026-11-04, with a real account, a plain quote file (one ECS card, São Paulo, monthly) went
through `plan-quote` and `apply-quote`. The gate passed with stored, rated and Edit prices equal,
and `validate` and `edit-check` agreed afterwards. One run failed because the calculator page did
not load for the Edit check; the gate deleted the list as designed, and the check now retries a
page that will not open once ([publish gate](explanation/huawei/publish-gate.md)).

## What has not

- The `version: "1"` declarative path was run live once (2026-11-04, one ECS card): plan and apply passed the gate. Two gaps showed (the second is fixed): the list is saved without the `[autocalc]` marker (declarative titles are stripped of tool branding on purpose, so find test lists by id). `quote.lock.yaml` recorded zero totals; it now carries the SKU list prices of the planned resources (disks and add-ons are priced when the list is published, so it can sit below the saved total). Wire budgeting, partitioning and multi-card quotes have still only run offline.
- Besides ECS, one DMS Kafka card (`dms.platinum.c6.kafka`, monthly, São Paulo) passed the gate live on 2026-11-04 (stored, rated and Edit 144.20). Two Redis specs failed first, because the chosen spec never reached the Redis form; after mapping the SKU's fields onto the page controls both pass (`redis.single.xu1.tiny.128` 1.06, `redis.ha.xu1.large.r2.1` 36.55, all three prices equal). The other recipe services still cannot apply a requested spec. Services not named here were not tried.
- Only ECS and that Kafka card were exercised end to end by hand. Other services are covered by recorded fixtures and
  the region sweep ([run the tests](how-to/run-tests.md)).
- Builder services take options through `apply_quote`; `plan-quote` rejects ones the builder does not know. Their page-control coverage (`schema coverage`) is still partial.

## Next to 0.9

See [the roadmap](roadmap.md) for the order. In short: finish wiring the circuit breaker (the unused lower tiers), close the OBS and save bugs from issues #2, #4 and #6, extend Edit verification past ECS and OBS, run the `version: "1"` path live, then map builder options in batches.

### Earlier list

The open items are in the [roadmap](roadmap.md). The ones that matter for "the base is done":

1. A live run of the declarative `version: "1"` path.
2. Mapping builder-service options to schema controls (`autocalc schema coverage <service>`).
3. Decisions on in-place update and naming/prune of saved lists.

Expanding service support comes after those.

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
