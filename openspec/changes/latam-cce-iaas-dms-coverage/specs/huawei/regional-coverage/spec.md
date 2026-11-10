## Purpose

Let operators determine which regional calculator configurations they can quote, and distinguish implementation coverage from independently verified publication and prices.

## ADDED Requirements

### Requirement: Coverage identifies regional configurations and evidence
Coverage SHALL identify the service, region, product variant, billing mode, option dimensions, evidence date and calculator version. Implementation, anonymous replay, rating and authenticated publication verification SHALL be reported separately. Schema control accounting SHALL NOT imply full functional coverage.

#### Scenario: Replay without price verification
- **WHEN** a São Paulo CCE Turbo case passes anonymous replay without an authenticated publish check
- **THEN** its report marks replay passed and publication unverified

### Requirement: Both target regions have independent reports
Coverage SHALL account independently for São Paulo and Santiago. A run SHALL preserve other regions' evidence, identify the effective scenario region and return unsuccessful status if any executed scenario fails. An unavailable product SHALL be distinguished from an implementation gap and from a connection failure.

#### Scenario: Santiago run after São Paulo
- **WHEN** an operator runs compatibility checks for Santiago after São Paulo
- **THEN** both reports remain available with their actual regions

#### Scenario: Upstream reset
- **WHEN** a connection reset prevents checking a product
- **THEN** the report records an environment blocker and does not certify the product or mark it regionally unavailable

### Requirement: Exclusions do not inflate usable coverage
The regional coverage report SHALL distinguish excluded configurations from unavailable configurations and from missing implementation. It SHALL state its denominator and SHALL NOT count excluded, defective, or unverified configurations as fully verified.

#### Scenario: Scoped exclusions
- **WHEN** the report summarizes this release's target coverage
- **THEN** Windows guest OS, private NAT, RocketMQ and the explicitly excluded publication-blocked services are identified separately
