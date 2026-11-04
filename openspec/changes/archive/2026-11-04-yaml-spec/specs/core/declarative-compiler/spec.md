# Spec Delta

## Purpose

Parse, validate, and compile declarative quote YAML files into vendor-neutral canonical resource intermediate representations (IR) with offline dimensional unit and billing duration normalization.

## ADDED Requirements

### Requirement: Declarative quote parsing and offline validation
The system SHALL parse declarative quote YAML documents specifying version "1", metadata, defaults,
machine templates, environments, and resource declarations, validating syntax and types offline without
making network requests or launching browser instances.

#### Scenario: Valid declarative document parses offline
- **WHEN** a valid quote YAML file is passed to compile or lint
- **THEN** the compiler produces the validated resource graph in under 50 milliseconds without network activity

#### Scenario: Missing required unit rejected
- **WHEN** a capacity, bandwidth, or duration field is provided as a unitless number
- **THEN** compiler validation fails with an error naming the field, card id, and required dimensional unit

### Requirement: Machine archetype template expansion
The compiler SHALL expand reusable machine templates into individual resource specifications while
allowing individual resource definitions to override specific template fields.

#### Scenario: Template expansion with overrides
- **WHEN** a resource references a template and overrides memory and quantity
- **THEN** the compiled resource contains the template defaults with the overridden memory and quantity

### Requirement: Anti-splitting enforcement for base-cost services
The compiler SHALL enforce the anti-splitting rule: resources with fixed baseline costs (including
CCE clusters, NAT gateways, and load balancers) SHALL NOT be split across multiple cards, reserving
splitting solely for purely variable metric lines bounded by UI widget maximums.

#### Scenario: Fixed-base resource rejects splitting
- **WHEN** a fixed-base resource exceeds single-card limits
- **THEN** the compiler emits an explicit error or advisory rather than duplicating cluster base fees

### Requirement: Duration and horizon normalization
The compiler SHALL normalize financial evaluation windows and billing units, scaling pay-per-use
quantities to the requested horizon (such as 8,760 hours, 365 days, or 12 monthly periods for annual horizons).

#### Scenario: 1-Year pay-per-use scaling
- **WHEN** a quote specifies an annual horizon (1y) with on-demand resources
- **THEN** the compiled IR reflects 8,760 hours or 12 times monthly metric volumes with consistent pricing units

### Requirement: Deterministic lockfile generation
The compiler SHALL generate deterministic lockfiles (`quote.lock.yaml`) recording pinned catalog SKUs,
rated list prices, partition maps, and share links so subsequent executions remain auditable and reproducible.

#### Scenario: Lockfile records exact spec and price
- **WHEN** a quote plan is executed successfully
- **THEN** a lockfile is written containing pinned SKUs, rated prices, and partition hashes
