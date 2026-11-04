# Tasks

## 1. Declarative AST and Offline Compiler

- [x] 1.1 Define TypeScript schemas and AST types for `quote.yaml` (`version: "1"`, `metadata`, `defaults`, `templates`, `environments`, `resources`) and verify unit tests validate compliant YAML and reject malformed schemas.
- [x] 1.2 Implement mandatory physical dimensional unit parser (`GB`, `TB`, `Mbit/s`, `h`, `mo`) and verify tests reject unitless numbers and convert valid units accurately.
- [x] 1.3 Implement template expander for machine archetypes and verify tests expand template defaults and apply per-resource overrides.
- [x] 1.4 Implement duration and horizon normalizer (1y $\to$ 8,760h / 365d / 12mo) and verify tests scale on-demand metric quantities accurately.
- [x] 1.5 Implement anti-splitting validator and verify tests block splitting on CCE clusters, NAT gateways, and load balancers.

## 2. Canonical IR and Lockfile Generator

- [x] 2.1 Define `CanonicalResourceIR` data models and serialization formats and verify round-trip unit tests.
- [x] 2.2 Implement lockfile generator (`quote.lock.yaml`) and verify tests write pinned SKUs, rated amounts, and partition hashes.
- [x] 2.3 Implement lockfile drift detector and verify tests report price and SKU discrepancies against active catalog caches.

## 3. Wire Optimization and Payload Budgeter

- [ ] 3.1 Implement wire size budgeter (compact JSON measurement, $\le$ 950 KiB and $\le$ 200 cards) and verify tests detect payload limit thresholds.
- [ ] 3.2 Implement auto-partitioner for large quotes and verify tests split quotes into correlated sub-lists with titles $\le$ 55 characters.
- [ ] 3.3 Implement lean card payload optimizer (pruning zero lines and unselected `bakPlanList` plans) and verify tests confirm identical pricing with reduced byte sizes.
- [ ] 3.4 Enforce zero-watermark policy in card and list titles and verify tests confirm absence of `autocalc` branding in generated payloads.

## 4. 4-Tier Circuit Breaker and Vendor Adapter

- [ ] 4.1 Define 4-tier degradation states (`FULL_GATE_VERIFIED`, `RATING_VERIFIED_EDIT_SKIPPED`, `CACHED_CATALOG_ESTIMATE`, `EXPORT_ONLY`) and verify unit tests.
- [ ] 4.2 Implement known-defect signature table (Kafka yearly Edit bug, OBS storage line drop) and verify tests route matching services to `RATING_VERIFIED_EDIT_SKIPPED`.
- [ ] 4.3 Implement catalog pricing anomaly guard (flagging yearly $> 11.5 \times$ monthly) and verify tests emit advisory warnings.

## 5. CLI & MCP Integration

- [ ] 5.1 Implement CLI command `autocalc compile-quote <file.yaml>` and verify offline compilation in under 50ms.
- [ ] 5.2 Implement CLI command `autocalc plan-quote <file.yaml>` generating `quote.lock.yaml` and verify output formatting.
- [ ] 5.3 Implement CLI command `autocalc apply-quote <file.yaml>` executing publication and verify return of share links.
- [ ] 5.4 Register `compile_quote`, `plan_quote`, and `apply_quote` on the MCP surface and verify integration tests over stdio.
