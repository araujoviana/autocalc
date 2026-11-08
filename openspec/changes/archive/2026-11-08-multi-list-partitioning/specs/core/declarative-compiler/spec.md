# Spec Delta: core/declarative-compiler

## MODIFIED Requirements

### Requirement: Deterministic lockfile generation
The compiler SHALL generate deterministic lockfiles (`quote.lock.yaml`) recording pinned catalog SKUs,
rated list prices, partition maps, and share links so subsequent executions remain auditable and reproducible.
When resources partition into multiple shards, the lockfile SHALL record the partition map and share links
for every shard.

#### Scenario: Lockfile records exact spec and price
- **WHEN** a quote plan is executed successfully
- **THEN** a lockfile is written containing pinned SKUs, rated prices, and partition hashes

#### Scenario: Lockfile records multiple partition shards and share links
- **WHEN** a quote with multiple partition shards is planned or applied
- **THEN** the lockfile records each partition's title, card count, byte budget, and published share link
