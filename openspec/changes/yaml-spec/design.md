# Design

## Context

See `proposal.md` for motivation. Autocalc currently binds CLI arguments directly to vendor calculator controls. While effective for simple single-card quotes, enterprise workloads (e.g. 300+ resources, multi-AZ storage, annual budgeting) require robust decoupling between user intent and vendor wire formats.

## Goals / Non-Goals

**Goals:**
- Provide a clean, declarative YAML specification (`quote.yaml`, `version: "1"`) with mandatory physical units (`GB`, `TB`, `Mbit/s`, `h`, `mo`).
- Support DRY machine archetypes (`templates`) and multi-environment partitioning.
- Implement an offline compiler producing a deterministic `CanonicalResourceIR` and `quote.lock.yaml`.
- Enforce the anti-splitting rule: never split baseline-cost resources (CCE, NAT, ELB) across cards.
- Implement a 4-tier circuit breaker to handle known vendor SPA defects (Kafka yearly re-pricing, OBS storage line drops).
- Implement pre-flight payload size budgeting ($\le$ 950 KiB / 200 cards) with automatic multi-list partitioning.
- Ensure strict zero-watermark policy: list and card titles belong 100% to the user.

**Non-Goals:**
- Automated migration/sizing from other cloud providers (GCP/AWS to Huawei flavor mapping remains outside autocalc).
- Non-USD currencies or custom enterprise discount negotiation.
- Direct billing payment execution (share links remain the primary deliverable).

## Decisions

### Decision 1: 3-Layer Decoupled Architecture
- **Choice**: Separate Layer 1 (Declarative YAML & Offline Compiler), Layer 2 (Canonical Resource IR & Lock Contract), and Layer 3 (Vendor Anti-Corruption Adapter).
- **Rationale**: Isolates user intent from vendor UI volatility. Vendor SPA DOM changes or API quirks never force changes to user YAML files.
- **Alternatives Considered**: Direct mapping of YAML to vendor cards (rejected: leaks vendor control IDs and widget limits into user YAML).

### Decision 2: 4-Tier Degradation Circuit Breaker
- **Choice**: Implement `FULL_GATE_VERIFIED` $\to$ `RATING_VERIFIED_EDIT_SKIPPED` $\to$ `CACHED_CATALOG_ESTIMATE` $\to$ `EXPORT_ONLY`.
- **Rationale**: Known upstream bugs in Huawei's calculator SPA (e.g. Kafka yearly card re-pricing on Edit or OBS 1076 GB fallback) should not prevent quotation creation when official rating endpoint prices are verified.
- **Alternatives Considered**: Strict fail-closed on every Edit discrepancy (rejected: 1 upstream bug blocks all 300-card quotes).

### Decision 3: Anti-Splitting Rule for Base Costs
- **Choice**: Only split purely variable metric lines (such as KMS API requests) when exceeding vendor stepper limits. Never split resources carrying fixed base costs (CCE clusters, NAT gateways, ELB baselines).
- **Rationale**: Splitting a CCE cluster or NAT gateway across cards duplicates baseline cluster management and gateway fees, distorting quotes.
- **Alternatives Considered**: Arbitrary card splitting based on total card count (rejected: increases customer costs).

### Decision 4: Lean Wire Payloads
- **Choice**: Strip zero-usage `productAllInfos` lines and prune unselected usage factor plans from `bakPlanList` for on-demand cards.
- **Rationale**: Prevents payloads exceeding Huawei's 1 MiB HTTP 413 limit for large quotes (~250 cards) while preserving identical prices.
- **Alternatives Considered**: Compressing request bodies with gzip (rejected: vendor API rejects compressed payloads with 415/400).

## Risks / Trade-offs

- **[Risk] Upstream calculator SPA changes control IDs or request formats** $\to$ *Mitigation*: Schema generation and versioned control bindings isolate changes to Layer 3; offline compiler and YAML specs remain unaffected.
- **[Risk] Multi-list partitioning creates fragmented share links** $\to$ *Mitigation*: Correlated naming (`Prefix - Part 1`, `Prefix - Part 2`) and root lockfile link aggregation keep partitioned quotes organized.
- **[Risk] Stepper limits change on new frontend versions** $\to$ *Mitigation*: Empirical control limit tables extracted directly from generated schemas.
