# Tasks

Execution detail: `docs/superpowers/plans/2026-11-10-latam-cce-iaas-dms-coverage.md`. Work in order. A blocked live check remains unchecked with a reason; it does not block unrelated offline implementation.

## 1. Regional inventory and reproducible validation

- [x] 1.1 Add regional configuration/evidence inventory and explicit exclusions; verify unit tests for region isolation, truthful denominators and distinct verification levels.
- [x] 1.2 Fix compatibility runner regional report preservation, effective-region labels and failure exit status; verify runner/harness unit tests and generated synthetic reports.
- [x] 1.3 Make business-scenario integration tests use synthetic catalog/labels/menu fixtures and reject unexpected network calls; verify `bun run test:offline` without user cache or session.
- [x] 1.4 Diagnose Playwright resets with sanitized network/proxy/CA diagnostics, record reachable hosts and environment blockers without weakening TLS; verify doctor and direct transport probes or record concrete unresolved evidence.

## 2. CCE coverage

- [x] 2.1 Inventory Standard/Turbo variants, master/scale dimensions, placement selectors and modes for both regions using the matching vendor config; verify normalized synthetic fixtures and inventory completeness checks.
- [x] 2.2 Extend schemas, builder, form-only publication, spec mapping and discovery without changing valid legacy Standard input semantics; verify CCE unit/form tests, unavailable-combination rejection, and discovery parity.
- [x] 2.3 Add regional replay and price-verification cases across every offered finite variant/mode plus boundaries and pairwise controls; update CCE docs and verify actual statuses for each region without claiming blocked checks pass.

## 3. CCE infrastructure dependencies

- [ ] 3.1 Implement dedicated ELB/LCU configurations with schemas, planning/publication mapping and boundary tests; verify stored/page product identity and usage fixtures and document options.
- [ ] 3.2 Unify EIP quote/build/publication option handling and support sold dedicated/shared bandwidth and billing modes; verify traffic regressions, mode validation and legacy input compatibility; update docs.
- [ ] 3.3 Implement only page-expressible placement selectors for scoped services and preserve requested quantities; verify supported round trips and continued rejection for unsupported services in publish and quote-file tests.

## 4. Remaining scoped IaaS controls

- [ ] 4.1 Audit ECS Linux, EVS, OBS, public NAT, SFS/SFS Turbo, CBR, Direct Connect, ER, VPC Endpoint, VPN, DSS, SDRS and DES against both regional inventories; verify every control is implemented/tested, unavailable, excluded or a documented portal defect with evidence.
- [ ] 4.2 Fix identified in-scope gaps in reviewable service commits with regression tests and updated service docs; inspect relevant preserved local commits without merging unrelated history; verify affected service suites and keep remaining gaps explicit.

## 5. Kafka and RabbitMQ

- [ ] 5.1 Add shared catalog/config-driven specification conversion, topology and storage resolution; verify fixture tests for new specs, missing rates, region isolation and invalid broker counts without guessing constants.
- [ ] 5.2 Wire both DMS builders and publication forms to supported instance/storage variants and regional modes while retaining per-broker storage semantics; verify single/cluster, quantity, storage boundaries and billing tests; update schemas/docs.
- [ ] 5.3 Extend both regional DMS replay/price cases across offered finite variants/modes and representative boundary controls; verify report statuses and keep RocketMQ and Reliability excluded.

## 6. Regional end-to-end acceptance

- [ ] 6.1 Add synthetic declarative CCE architecture scenarios with workers, disks, public networking, dedicated ELB, Kafka and RabbitMQ for each region; verify complete component quantities and totals through plan/apply with test doubles.
- [ ] 6.2 Run anonymous scoped regional replay and independent rating checks; verify per-region reports retain timestamp/version and distinguish environment blockers from product unavailability.
- [ ] 6.3 Run authenticated synthetic publication checks in each region with stored/rated/Edit equality, including a representative complete architecture; clean up only created test lists and keep identifiers outside Git; verify gate results or document blocker without marking complete.
- [ ] 6.4 Run `bun run check`, `bun run check:boundaries`, `bun run test:offline`, `bun run docs:build`, and `openspec validate latam-cce-iaas-dms-coverage --strict`; review diff for scope/privacy, update status/roadmap/coverage claims, and report unresolved rows honestly.

## Workflow follow-up

- AGY implements this user-authorized change, leaving reviewable local commits and a final report.
- Do not push, merge, release, archive, delete existing user resources or modify preserved branches automatically.
