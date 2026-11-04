# Project status

Last updated 2026-11-04, at the end of the TypeScript migration. This page is the starting point
for whoever picks the work up; the detail lives in the pages it links.

## Where things stand

The implementation is TypeScript on Bun (v0.2.0, [ADR-0017](adr/0017-typescript-on-bun-is-the-target.md)).
All three layers of the declarative design exist and are covered by the offline suite
([architecture](explanation/architecture.md)):

| Layer | State |
|---|---|
| Declarative (`src/core/compiler/`) | Implemented: units, templates, expander, canonical IR, lock file, wire budgeting, partitioning, circuit breaker |
| Canonical (`src/core/quote/`, `quote-file.ts`) | Implemented: ranking, drafts, run records, plan and apply |
| Vendor (`src/providers/`, `src/core/page/`, `gate.ts`, `src/schema/`) | Implemented: catalog, rating, page encoder, generated schemas, publish gate |

## What has been checked live

On 2026-11-04, with a real account, a plain quote file (one ECS card, São Paulo, monthly) went
through `plan-quote` and `apply-quote`. The gate passed with stored, rated and Edit prices equal,
and `validate` and `edit-check` agreed afterwards. One run failed because the calculator page did
not load for the Edit check; the gate deleted the list as designed, and the check now retries a
page that will not open once ([publish gate](explanation/huawei/publish-gate.md)).

## What has not

- The `version: "1"` declarative path has only been run offline. It needs a live `plan-quote` /
  `apply-quote` run.
- Only ECS was exercised end to end by hand. Other services are covered by recorded fixtures and
  the region sweep ([run the tests](how-to/run-tests.md)).
- The 19 builder services cannot take options through `apply_quote` yet.

## Next

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
