# Design

## Context

See proposal.md for the operator's scope. Baseline is v0.6.0 (`faeb483`) on `review/latest-20261110`; original local work is preserved on `main` and `backup/local-main-20261110`. The working tree also contains user-owned `run3.sh`, `v4.yaml`, `vpn.yaml` which must not be read as fixtures, modified or committed.

Existing CCE builder explicitly rejects Turbo. EIP has two divergent surfaces: a traffic-oriented legacy builder and a publication recipe with bandwidth options. ELB fixes shared product type. Kafka/RabbitMQ builders embed conversion tables and a single storage type. All service schemas account for controls, but 189 controls are declared unsupported and omitted from the mapped percentage. Reports currently overwrite `docs/compat/<service>.md`, label the runner default region even when a scenario overrides it, and do not set a failing process exit code.

Baseline check: typecheck/boundary checks pass; offline suite has 626 passing and two live-catalog-dependent failures in `tests/integration/business-scenarios.test.ts`. Doctor fails rating/exchange/page probes. curl HTTPS reaches the page, CDN and portal; Playwright API requests reset. This is a transport discrepancy, not proof of unavailable services or a specific blocked port.

## Goals / Non-Goals

Complete the operator's regional configurations, then produce honest evidence for both target regions. Keep the page as encoder (ADR-0001), publish verification (ADR-0003), shared CLI/MCP registry (ADR-0007), declarative schemas (ADR-0018), and TypeScript/Bun runtime (ADR-0017).

No new provider, framework, dependency, service family, credential export, unrelated rewrite, in-place saved-list update or global multi-region-list redesign. Windows guest images are excluded; Windows host execution remains supported. Preserve the explicit service exclusions in proposal.md, including SSA. Do not globally enable AZ placement for services whose forms cannot express it.

## Decisions

1. **One regional configuration inventory, several evidence levels.** Add `tests/support/compat/coverage.ts` and a small synthetic coverage fixture. Key rows by region/service/variant/mode/configuration dimensions, not a service-level boolean. Record implemented, replay, rating and publication independently, with timestamp/version and reasons. Include control exceptions and declared exclusions. Reports under `docs/compat/<region>/<service>.md` plus `docs/compat/coverage.md` retain existing single-file references as summaries. Do not count dimensions as exhaustive Cartesian coverage unless actually tested; use exhaustive finite variant/mode enumeration plus boundary and pairwise controls, and disclose the strategy.

2. **Catalog and matching config determine legal combinations.** Reuse `catalog.ts`, `availability.ts`, service config tooling and regional schemas. No token borrowing across regions or speculative vendor constants. Synthetic normalized fixtures can capture fields used by tests; downloaded frontend bundles and real customer cards stay outside Git. Availability is distinct from implementation support. Vendor defects such as BYOL encoding mismatch or OBS PFS capacity are recorded with evidence, not hidden or bypassed.

3. **CCE first; additive options.** Extend `schemas.ts`, `services/cce.ts`, `services/forms.ts`, `services/publication.ts` and `schema/files/cce.yaml`. Keep legacy `cluster_type: standard`, `ha` and `scale` requests valid. Add explicit selection for Standard/Turbo and any additional regional master/scale dimensions discovered from configuration; do not equate product category with an ambiguous display token. Update discovery, planning and form-only encoding together. Placement selectors apply only to services where the page supports them; change the unconditional `publish.ts` AZ rejection only behind proven per-service capability and round-trip tests.

4. **Infrastructure audit has a finite boundary.** Inventory all exposed controls for ECS Linux, EVS, EIP, ELB, OBS, public NAT, SFS, SFS Turbo, CBR, Direct Connect, ER, VPC Endpoint, VPN, DSS, SDRS and DES in both regions. Prioritize dedicated ELB/LCU, EIP bandwidth/shared-bandwidth and CCE resource quantities. Fix discovered in-scope gaps service by service. A missing vendor option must remain explicitly unavailable or defective, not silently defaulted. Compare the 12 preserved local commits as reference only; port relevant hunks with regression tests, never merge the entire divergent history blindly.

5. **DMS shares validated configuration resolution.** Add `services/dms-config.ts` only for Kafka/RabbitMQ specification, conversion and storage/topology resolution. Return normalized `{specId, conversionRate, storageSpec, storageType, allowedBrokers}` using the selected service and region's recovered configuration. Reject incomplete configuration. Both legacy build and publication form paths must resolve the same values. Keep current valid spec inputs and per-broker `storage_gb` semantics; expose storage selection additively and never change old callers' units silently.

6. **Real offline tests and separate live evidence.** Replace network-backed business-scenario dependencies with synthetic reader/catalog fixtures that fail unexpected access. Keep a distinct live matrix for regional catalog/page/rating/authenticated checks. Tests must not depend on a warm user cache. Add a script that invokes the existing runner over the scoped services and two regions sequentially. It must propagate failures, preserve successful evidence and report environment blockers without certifying them.

7. **Gate invariant retained.** New paths pass the same stored/rated/Edit checks. Preserve existing explicitly declared portal-defect behavior without adding generic skip rules. Synthetic authenticated tests use `[autocalc]` list names, retain identifiers outside the repo, and clean up only lists created by that test. A missing session or unreachable host blocks live acceptance, not independent implementation and offline work.

## Risks / Trade-offs

- Vendor options vary by region/version: inventory before implementation; retain runtime rejection and versioned evidence.
- Network reset in Playwright: diagnose sanitized underlying transport errors, proxy and CA behavior without disabling TLS verification or exposing environment secrets. Stop network-dependent certification when blocked; continue offline tasks.
- Legacy builders and publication forms differ: test both APIs plus declarative `plan`/`apply`, not just builder output.
- Scope contains many controls: deliver CCE, ELB/EIP, remaining IaaS, DMS in ordered reviewable commits. Leave tasks incomplete when genuinely blocked; never claim full coverage from metadata.
- Synthetic tests prove encoding logic, not current prices: publication-level status requires actual authenticated regional evidence.

## Migration Plan

Add explicit options without removing old ones; keep old report URLs as summary links. Implement on the current review branch without touching preserved main branches or user files. AGY may create a feature branch before editing. Do not push, merge, archive or release automatically. New live failures keep publication fail-closed. Rollback is reverting individual feature commits, without modifying existing saved lists.
