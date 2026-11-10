# LATAM CCE, IaaS and DMS Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The user explicitly selected AGY as implementer; do not substitute another agent or ask again whether to begin.

**Goal:** Make the in-scope CCE, IaaS, Kafka and RabbitMQ configurations usable for São Paulo and Santiago quotes, with independently recorded publication and price evidence.

**Architecture:** Extend the existing regional catalog, service forms/builders, schema mappings and page encoder. Preserve the publish gate, make offline fixtures deterministic and add a regional coverage inventory with separate evidence levels. Complete CCE before infrastructure dependencies, the remaining IaaS audit and DMS.

**Tech Stack:** TypeScript, Bun 1.4.4, Playwright 1.63.0, Zod, existing CLI/MCP registry and OpenSpec. No new runtime dependency planned.

**Spec:** `openspec/changes/latam-cce-iaas-dms-coverage/` (proposal, design and both spec deltas). Track completion in its `tasks.md`.

## Global Constraints

- Target regions: `sa-brazil-1` and `la-south-2`; no fallback from one region's SKU or price to another.
- USD list prices only: no discounts, no other currencies.
- No client data in the repo, ever: no customer names, quotes or saved-list contents in specs, docs, tests or commits.
- Everything must work on Windows and Linux.
- Windows guest OS quotations, private NAT, RocketMQ, AWS and other regions' certification are excluded.
- Do not enable `aad`, `cc`, `dbss`, `dsc`, `edgesec`, `esw`, `ga`, `hecs`, `reliability`, `ssa`, `ucs` publication in this change.
- Do not weaken, bypass or add generic skip rules to stored/rated/Edit checks. No TLS verification bypass.
- Never touch or commit `run3.sh`, `v4.yaml`, `vpn.yaml`; never read saved user quotes as fixtures. Preserve `main` and `backup/local-main-20261110`.
- Live blockers remain reported as blockers; offline implementation continues. No push, merge, release or archive.

## Review Focus

- A regional SKU exists in the catalog but not in the page, or the page/config version differs: reject rather than silently substitute (Tasks 1, 2, 5).
- Legacy EIP and recipe/publication paths accept different inputs: both must retain old valid semantics and expose new variants consistently (Task 3).
- User asks for multiple cluster resources where a page omits quantity: totals and actual card quantities must agree (Tasks 2, 3, 7).
- A new DMS SKU has no known conversion rate or storage is per broker: reject incomplete rates and prevent multiplied or omitted storage (Task 6).
- Network reset or missing auth occurs after partial evidence: preserve other regions' reports and never promote the unverified row (Tasks 1, 7).

## Task 1: Regional evidence and deterministic tests

**Files:** Create `tests/support/compat/coverage.ts`, `tests/unit/regional-coverage.test.ts`, `tests/support/business-catalog.ts`, normalized synthetic fixtures under `tests/fixtures/compat/`. Modify `tests/support/compat/run.ts`, `replay.ts`, `tests/unit/compat-harness.test.ts`, `tests/integration/business-scenarios.test.ts`. Reports: `docs/compat/coverage.md`, `docs/compat/<region>/<service>.md`.

**Interfaces:** Export `TARGET_REGIONS = ["sa-brazil-1", "la-south-2"] as const`; `CoverageCase` has region, service, variant, billing, option dimensions and evidence metadata. `renderCoverage(cases: CoverageCase[]): string` reports implementation/replay/rating/publication separately. Keep `runScenario` compatible; extend result metadata for effective region and environment blockers. Synthetic readers implement existing `PublicReader.get` and reject unknown fixture URLs.

- [ ] Write tests for independent regional evidence, mixed scenario regions, a failed scenario causing nonzero exit, no certification from replay alone, excluded denominator, and preservation of previous evidence; run to confirm failure.
- [ ] Implement inventory/report changes and normalized catalog/labels/menu readers. Cover all existing 20 business scenarios without touching a warm user cache; move genuinely live assertions to live tests.
- [ ] Run `bun test tests/unit/regional-coverage.test.ts tests/unit/compat-harness.test.ts tests/integration/business-scenarios.test.ts`, then `bun run test:offline`; pass with empty temporary AUTOCALC_CACHE and no session. Update compat usage documentation and commit only task files.
- [ ] Diagnose the observed curl-versus-Playwright resets using sanitized host/status/error-name evidence; check proxy/CA handling without logging secrets or disabling TLS. Record unresolved networking rather than blocking unrelated tasks.

## Task 2: CCE Standard and Turbo

**Files:** Modify `src/core/schemas.ts`, `src/core/services/cce.ts`, `forms.ts`, `publication.ts`, `src/schema/files/cce.yaml`, `tests/unit/cluster-builders.test.ts`, `tests/support/compat/scenarios/cce.ts`, relevant service-safety/spec-mapping tests and generated CCE docs.

**Interfaces:** Keep `buildCce(input, context)` and legacy `cluster_type`, `ha`, `scale` semantics. Add explicit category/master/placement fields only as supported by recovered regional controls. `supportedServices()`/`legalOptions()` must expose the same supported options consumed by plan/build/form-only publication.

- [ ] Recover the actual regional Standard/Turbo product/scale/master/mode combinations from catalog plus matching page/config. Store normalized synthetic fields; add tests for offered Turbo, unavailable combination, legacy Standard compatibility and both regional catalogs. Confirm current Turbo test fails on the existing rejection.
- [ ] Implement catalog/config-driven form selection without guessed tokens or fixed s1/s2-only logic. Extend schema/normalizer only where needed; never treat a category selector as an arbitrary SKU suffix.
- [ ] Run `bun test tests/unit/cluster-builders.test.ts tests/unit/spec-mapping.test.ts tests/unit/schema-invariants.test.ts tests/unit/service-safety.test.ts`. Add boundary and pairwise replay cases plus each finite offered variant/mode. Update docs and commit.

## Task 3: Dedicated ELB and EIP variants

**Files:** Modify `services/elb.ts`, `services/eip.ts`, `services/forms.ts`, `services/publication.ts`, `schemas.ts`, `schema/files/{elb,eip}.yaml`, service unit tests, compat scenario files and generated docs.

**Interfaces:** Keep `buildElb(input, context)` and `buildEip(input, context)` compatible. Add explicit variant/storage-independent bandwidth and LCU usage options using recovered control names. Ensure the same options are valid through CLI/MCP, form-only publication and declarative specs.

- [ ] Add failing tests for dedicated ELB/LCU, shared bandwidth, dedicated bandwidth monthly/yearly/pay-per-use where sold, legacy traffic EIP, invalid combinations, missing regional specs and quantity >1.
- [ ] Implement both product variants without forcing shared ELB or traffic-only EIP. Preserve zero/positive usage semantics as the page expresses them; no artificial product fallback. Test actual product identities, quantities, usage units and requested form state.
- [ ] Run affected service tests plus `bun test tests/unit/spec-mapping.test.ts tests/unit/service-safety.test.ts tests/unit/schema-invariants.test.ts`. Expand both regional matrices, regenerate service docs and commit.

## Task 4: Placement and quantity round trips

**Files:** Modify `core/publish.ts`, `core/quote/model.ts`, `core/quote-file.ts`, relevant schema/form drivers only for demonstrated controls; extend publication, quote-file and service tests.

**Interfaces:** Replace unconditional AZ rejection only with a per-service representability decision; unsupported services remain rejected. Preserve existing `az` meaning rather than inventing AZ names from an unrelated page selector. Keep logical resource to physical card mapping in compiler IR consistent with quantities.

- [ ] Add tests for supported placement round trip, unsupported placement rejection, multi-unit resources lacking a page quantity control, and mixed CCE/ECS/disk/ELB quantities. Confirm existing restrictions fail the intended positive cases.
- [ ] Implement only selectors and quantity/card expansion supported by observed page behavior. If a selector does not represent actual AZ choice, retain rejection and record that limitation accurately.
- [ ] Run publication/quote-file/compiler/schema suites, document actual placement semantics and commit. Do not mark unavailable placement as implemented.

## Task 5: Close remaining scoped IaaS gaps

**Files:** Scoped service builders under `src/core/services/`, matching `src/schema/files/`, compat scenarios, existing service tests and service docs. Inventory lists ECS Linux, EVS, OBS, public NAT, SFS/SFS Turbo, CBR, Direct Connect, ER, VPC Endpoint, VPN, DSS, SDRS, DES.

**Interfaces:** Retain existing builder/form signatures and units. Inventory each exposed in-scope control against both regional catalogs/pages and test available boundary/variant values; share no new global service-enablement behavior.

- [ ] Compare each service's currently unsupported/fixed controls against actual regional options; create actionable rows for implementation gaps and evidence rows for regional unavailability or portal defects. Inspect preserved commits for relevant prior fixes without wholesale merging.
- [ ] For each actionable gap add a named failing regression test, implement the minimal schema/form/builder/mapping change, and run that service's suite before moving on. Cover missing SKUs, term limits, capacity boundaries, unit conversions and unsupported combinations. Record BYOL/PFS defects honestly if vendor behavior prevents encoding.
- [ ] Run `bun run test:offline` after the service commits; update each affected service reference and regional inventory. No ignored in-scope control may disappear from the report.

## Task 6: Kafka and RabbitMQ

**Files:** Create `src/core/services/dms-config.ts`, `tests/unit/dms-config.test.ts`. Modify `services/kafka.ts`, `rabbitmq.ts`, relevant form/publication helpers, `schemas.ts`, schema YAML, DMS unit tests, scenario files and docs.

**Interfaces:** `resolveDmsConfig(service: "kafka" | "rabbitmq", region: string, selection: DmsSelection, source: DmsConfigSource): ResolvedDmsConfig` returns `{specId, conversionRate, storageSpec, storageType, allowedBrokers}`. Define input/source types from normalized recovered fields in the same module; accept no guessed fallback rate. Retain `storage_gb` as per-broker capacity; total storage equals capacity times brokers. Both legacy build and form-only paths consume the same resolver semantics.

- [ ] Add failing tests for a spec outside the old rate tables, missing conversion metadata, invalid single/cluster counts, service/region mismatch, alternative sold storage types, quantity and all sold billing modes.
- [ ] Replace incomplete fixed conversion/storage selection with verified configuration resolution. Validate versions/topologies against config rather than inferring unsupported combinations from string suffixes alone. Do not broaden into RocketMQ or Reliability.
- [ ] Run `bun test tests/unit/dms-config.test.ts tests/unit/kafka.test.ts tests/unit/cluster-builders.test.ts tests/unit/spec-mapping.test.ts tests/unit/schema-invariants.test.ts` plus any new RabbitMQ tests. Expand regional cases and docs, then commit.

## Task 7: Integrated acceptance and truthful reporting

**Files:** Extend synthetic architecture fixtures/tests; add `tests/live/latam-coverage.test.ts` and a scoped sequential regional runner under `tests/support/compat/`; update `docs/status.md`, `docs/roadmap.md`, service docs and coverage reports.

**Interfaces:** Reuse production `plan`/`apply` and existing publish gate. Live test records separate anonymous/rating/authenticated evidence and only operates on synthetic `[autocalc]` test lists it creates. Keep IDs, shares and credentials outside Git.

- [ ] Add/run synthetic complete architecture tests for both regions, including cluster management, Linux workers, disks, networking, ELB and DMS; assert every requested component quantity and total is accounted for, including >1 units.
- [ ] Run CCE then scoped IaaS then DMS anonymous regional replay and independent rating. For new variants require stored/rated/Edit agreement in authenticated synthetic publication tests. Preserve portal-defect flags separately from fully verified results; clean up only created lists. On network/auth blockers keep the affected task unchecked and retain sanitized evidence, while completing independent tasks.
- [ ] Run `bun run check`, `bun run check:boundaries`, `bun run test:offline`, `bun run docs:build`, `openspec validate latam-cce-iaas-dms-coverage --strict`; inspect diff and status. Verify generated docs have no unexpected drift. Run changed tests again only after further changes or failures.
- [ ] Update OpenSpec checkboxes with actual completion, commit reviewable work, and report implemented configurations, regional evidence, failures/blockers, commands and commits. Never equate plan completion, schema accounting or anonymous replay with production certification. Do not push, merge, release or archive.
