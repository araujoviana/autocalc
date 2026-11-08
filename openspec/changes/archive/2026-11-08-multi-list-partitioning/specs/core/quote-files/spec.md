# Spec Delta: core/quote-files

## MODIFIED Requirements

### Requirement: Plan has no side effects on the website
`plan` SHALL validate the file, resolve requirements through the existing ranking, rate each
card, and report per card the resolved spec, the price, unmapped options and whether the price
differs from the lock file. It SHALL NOT save, update or delete anything on the website. When a
quote exceeds single-list card or byte limits, `plan` SHALL calculate and display partition
shards with estimated card counts and wire byte sizes.

#### Scenario: Plan an ambiguous requirement
- **WHEN** a card asks for a size that matches several specs
- **THEN** the plan shows the ranked candidates, requires the caller to choose one, and applies nothing

#### Scenario: Plan an exact match
- **WHEN** a card asks for a size with exactly one match
- **THEN** the plan resolves it and shows the price

#### Scenario: Plan a partitioned quote
- **WHEN** a quote file contains cards exceeding single-list card or byte constraints
- **THEN** the plan reports the number of shards, the card count per shard, and the estimated wire byte size

### Requirement: Apply publishes through the gate
`apply` SHALL publish the planned cards through the existing fail-closed publish gate and SHALL
return the share link and per-card checks. It SHALL refuse to apply a plan with unresolved
requirements or options the schema does not map. When a quote partitions into multiple shards,
`apply` SHALL publish each shard as an independent verified list named with the shard suffix
(`Part 1`, `Part 2`, ...), verifying every card through the fail-closed gate before returning the
complete list of share links.

#### Scenario: Unresolved requirement
- **WHEN** apply is called on a file with an unresolved requirement
- **THEN** it fails naming the card and saves nothing

#### Scenario: Gate fails
- **WHEN** a card's stored price disagrees with its Edit price
- **THEN** the list is deleted, no link is returned, and the failing card is named

#### Scenario: Apply multi-shard quote
- **WHEN** apply is called on a quote that partitions into multiple shards
- **THEN** each shard is published as an independent verified list, verified through the publish gate, and all share links are returned
