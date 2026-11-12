# core/quote-files Specification

## Purpose
A quote can be written as a reviewable file of cards, checked against the service schemas, planned without side effects, and applied through the publish gate.

## Requirements

### Requirement: A quote file declares cards
A quote file SHALL declare a customer, optional defaults (region, billing mode), and cards.
Each card SHALL name its service type, quantity, billing mode and options. A card MAY ask for a
size (`needs`) instead of a specific spec, and MAY set options only the service's schema names.

#### Scenario: Defaults apply
- **WHEN** a card omits region and billing and the file defines defaults
- **THEN** the card uses the defaults

### Requirement: Cards are validated against the schema
Validation SHALL run offline, with no browser and no network. It SHALL reject an unknown
service, an option the schema does not map, a value outside a control's range or static values,
and a missing required option, each naming the card and the field and listing the legal values or
options.

#### Scenario: Unknown option
- **WHEN** a card sets `sytem_disk_gb`
- **THEN** validation fails naming the card and the field, and listing the allowed options

#### Scenario: Out of range
- **WHEN** a card sets a value outside the control's range
- **THEN** validation fails naming the range

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
requirements or options the schema does not map.

#### Scenario: Unresolved requirement
- **WHEN** apply is called on a file with an unresolved requirement
- **THEN** it fails naming the card and saves nothing

#### Scenario: Gate fails
- **WHEN** a card's stored price disagrees with its Edit price
- **THEN** the list is deleted, no link is returned, and the failing card is named

#### Scenario: Apply multi-shard quote
- **WHEN** apply is called on a quote that partitions into multiple shards
- **THEN** each shard is published as an independent verified list, verified through the publish gate, and all share links are returned

### Requirement: Apply publishes each shard as its own list
When a quote partitions into multiple shards, `apply` SHALL publish each shard as an independent
verified list named with the shard suffix (`Part 1`, `Part 2`, ...) and SHALL return every share link.

#### Scenario: Shard lists are named and linked
- **WHEN** a quote partitions into two shards and is applied
- **THEN** lists named `<title> - Part 1` and `<title> - Part 2` are published and both links are returned

### Requirement: A lock file pins resolved specs
After a plan resolves a requirement, the system SHALL record the resolved spec in a lock file
beside the quote file. A later plan SHALL use the pinned spec and SHALL report, not apply, any
change in the spec's availability or price.

#### Scenario: Catalog moved
- **WHEN** a pinned spec's price changed since the lock was written
- **THEN** the plan reports the change and the new price and does not silently re-resolve

### Requirement: Quote files hold no client data in the repository
Quote and lock files SHALL be read from a path the caller names. Files shipped in the repository
SHALL be synthetic.

#### Scenario: Fixture
- **WHEN** a quote file under the repository's tests is read
- **THEN** it contains no customer name or saved-list content
