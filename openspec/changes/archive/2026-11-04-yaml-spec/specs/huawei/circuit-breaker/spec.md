# Spec Delta

## Purpose

Isolate upstream Huawei Cloud pricing calculator SPA and API defects using a 4-tier graceful degradation circuit breaker, pre-flight payload size budgeting, and lean card encoding.

## ADDED Requirements

### Requirement: Four-tier graceful degradation
The publisher SHALL execute an adaptive circuit breaker providing four degradation tiers: FULL_GATE_VERIFIED,
RATING_VERIFIED_EDIT_SKIPPED, CACHED_CATALOG_ESTIMATE, and EXPORT_ONLY, bypassing unstable portal steps
when confirmed vendor SPA defects are detected.

#### Scenario: Verified rating fallback on known SPA defect
- **WHEN** a service has a verified vendor portal Edit defect (such as Kafka yearly re-pricing)
- **THEN** the circuit breaker uses RATING_VERIFIED_EDIT_SKIPPED, logging an advisory and preserving valid quotes

#### Scenario: Full publish gate verification when stable
- **WHEN** all quoted services operate normally on the active calculator frontend
- **THEN** the circuit breaker requires FULL_GATE_VERIFIED status before creating share links

### Requirement: Pre-flight payload size and card count budgeting
The publisher SHALL calculate compact JSON payload sizes before remote submission. When a payload
exceeds 950 KiB or 200 cards, the system SHALL automatically partition the quote into multiple correlated lists.

#### Scenario: Large quote automatically partitioned
- **WHEN** a quote compiles to 250 cards or exceeds 950 KiB
- **THEN** the publisher splits the quote across distinct sub-lists, returning correlated share links for each

### Requirement: Lean card payload optimization
The card encoder SHALL strip unnecessary zero-usage product lines and redundant backup plan lists
(`bakPlanList`) from pay-per-use cards, reducing serialized byte size without changing calculated prices.

#### Scenario: Zero lines and foreign plans stripped
- **WHEN** an on-demand OBS or DEW card is encoded for publication
- **THEN** zero-usage lines and plans belonging to other usage factors are omitted from the wire payload

### Requirement: Catalog pricing anomaly guard
The system SHALL flag anomalous vendor catalog ratios where a yearly package costs more than 11.5 times
the monthly price (such as anomalous Redis HA SKUs) and emit an advisory warning before applying quotes.

#### Scenario: Anomalous yearly SKU flagged
- **WHEN** a requested yearly SKU rates higher than 11.5 times the monthly equivalent
- **THEN** the planner emits an advisory warning highlighting the pricing anomaly and suggesting monthly billing
