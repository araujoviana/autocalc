# Roadmap

Work moves through OpenSpec changes in this order; every row below is delivered. Each change carries its own spec delta and
lands when its code does ([ADR-0000](adr/0000-record-architecture-decisions.md)). Archived changes
live in `openspec/changes/archive/`.

| # | Change | Delivers |
|---|---|---|
| 1 | `auth-sessions` | Persistent browser profile as the credential, system browser ([ADR-0011](adr/0011-auth-browser-profile-is-the-credential.md)) |
| 2 | `spa-encoder-poc` | Time-boxed proof that driving the real form yields Edit-faithful cards ([ADR-0001](adr/0001-page-as-encoder.md)) |
| 3 | unscheduled (not delivered by archived `quote-core`) | Provider-neutral quote model (strangler core, [ADR-0015](adr/0015-strangler-core-and-aws-second.md)) |
| 4 | `publish-gate` | Fail-closed verification before a link is returned ([ADR-0003](adr/0003-fail-closed-publish-gate.md)) |
| 5 | `workflow-surface` | `draft_quote` → `revise_quote` → `publish_quote`, CLI and MCP from one registry ([ADR-0007](adr/0007-workflow-surface-and-one-registry.md)) |
| 6 | `spa-encoder` | Page-as-encoder for the seven existing services |
| 7 | `distribution` | One-command install from git tags, `install.sh` / `install.ps1` ([ADR-0019](adr/0019-distribution-bun-from-git-tags.md)) |
| 8 | `builder-wave-1` | The 13 existing builders verified on the page; 20 of 93 quotable services ([v1 scope](explanation/v1-scope.md)) |
| 9 | `builder-wave-2` | Databases and storage via form recipes; 33 of 93 quotable services |
| 10 | `builder-wave-3` | Networking, security and middleware via form recipes; 50 page-accepted services at the time |
| 11 | `card-schema` | Generated card schemas, quote files and `plan_quote` / `apply_quote` ([ADR-0018](adr/0018-declarative-quotes-and-generated-card-schema.md)) |
| 12 | `ts-parity` | TypeScript on Bun reaches parity and replaces Python; v0.2.0 ([ADR-0017](adr/0017-typescript-on-bun-is-the-target.md)) |
| 13 | `yaml-spec` | Declarative `version: "1"` quote files: unit-checked YAML, templates, canonical IR, lock file, wire budgeting and partitioning, 4-tier circuit breaker |

AWS is v2.

## Open items

These came out of the retired backlog. The roadmap is the single backlog; GitHub issues are cited from the 0.9 plan below rather than tracked separately.
Each item is either assigned to the change that will close it or left unscheduled.

| Item | Goes to |
|---|---|
| `publish_quote` for services beyond the supported verified set | unscheduled |
| Map ranked catalog specs onto each recipe service's page values (until then publication must reject unapplied specs) | unscheduled |
| Quotes that span several regions in one saved list | unscheduled (not delivered by archived `quote-core`) |
| Availability-zone handling for services that price per AZ | unscheduled (not delivered by archived `quote-core`) |
| Browser setup by the installer (`autocalc doctor` says when `install-browser` is needed) | unscheduled |
| Nightly frontend drift check (alert when the calculator version or a service config changes) | unscheduled, after `distribution` |
| Nightly live and render test jobs on CI (they need a stored session) | unscheduled, after `distribution` |
| Region sweep (`tests/support/region-sweep.ts`, 2026-10-23): in `eu-west-101` 34 of the 100 verified combinations fail because the builders' default SKUs are not sold there (`CBC.6006` / `SPEC_NOT_FOUND`); `hecs` is not offered there. In the primary regions (São Paulo, Santiago, Singapore) all 300 combinations pass | unscheduled |
| Saved-list naming and prune (ADR-0014, superseded by ADR-0016): `apply-quote` now warns when a list of the same name exists, but nothing replaces or prunes it | unscheduled |
| Restore publication for LTS storage/retention, FunctionGraph compute, CCE turbo and the default-only recipes once their control mappings and prices are verified ([audit remediation](how-to/audit-remediation.md)) | unscheduled |
| Profile browser reuse and memory under concurrent tool calls | unscheduled |
| The calculator's EU and China sites | unscheduled, after v1 |
| Update a saved list in place from a quote (`update` was removed in ts-parity 4.3: it saved without the publish gate; needs a gated, rollback-safe design, see [share update](explanation/huawei/share-update.md)) | unscheduled |
| Map the 19 builder services' options to schema controls (`autocalc schema coverage <service>` is the to-do list); until then `apply_quote` refuses options on them | unscheduled |
| Live end-to-end check of the `version: "1"` compiler path (`plan-quote` / `apply-quote` on a declarative file) | unscheduled |


## 0.9 plan (triaged 2026-11-04 against the TypeScript code)

GitHub issues #1, #2, #4, #5 and #6 were written against the Python code or an early TypeScript snapshot. This table is their current state; the roadmap is the single backlog, and each row cites its issue.

| # | Item | State | Issue |
|---|---|---|---|
| 1 | Known portal defects (OBS pay-per-use, Kafka yearly) no longer fail the gate on a wrong Edit price when stored and rated prices agree; the check is flagged and `apply-quote` warns. **Still open:** the catalog anomaly guard (`detectCatalogPricingAnomalies`) is not called from `plan-quote`, and the lower degradation tiers (cached estimate, export only) are unused | partly done | #2, #4.2, #5.3, #5.4, #6.9 |
| 3 | Per-field limits (DEW kms api 9,999, DEW secrets 99, OBS requests 9,999, OBS GB 102,400) validated, with splitting that respects tiered fields | open | #6.3, #6.4 |
| 5 | Edit verification beyond ECS and OBS (`edit-check-browser.ts` answers `unavailable`), with the known-defect table | open | #5.3 |
| 6 | Live run of the `version: "1"` path | open | |
| 7 | Map builder options to schema controls, in batches (coverage today: ecs, eip, redis, sfs 100%; dline 67; evs 57; cbr, nat 50; cce, cci, obs 44; apig, dew 43; kafka 40; rabbitmq 36; function, waf 33; rds 31; apm, lts 30; elb 21; nosql 20) | open | |
| 7b | Record which configurations per service have passed plan, apply and the gate live, and show that beside coverage. The coverage percentage only counts controls that have an option name | open | |
| 8 | Billing-mode planning for a whole list, update in place, xlsx export, pay-per-use for one year, yearly package helpers | after 0.9 | #5.1, #5.4, #5.7, #6.7, #6.8 |

Already done in the TypeScript code, so the issue text no longer applies: list-name length is validated (50 characters, `src/core/publish.ts`), HTTP 413 maps to `PAYLOAD_TOO_LARGE`, OBS `quote` picks the SKU by usage factor, the Python session and MCP bugs of #1, the OBS schema holes of #4.3 (`unit` required, `multi_az` checked against the storage factor, per-mode errors in `compare_modes`), and recovery from an unknown save outcome (the gate adopts the one new list of that name and still verifies it; none means safe to retry; several are named).

When an item is done, remove its row in the same commit as the change that closes it.
