# Spec Delta

## Purpose

Accept the Huawei region names people actually use and stop a request that cannot be built in a region before it produces a broken card, with an error that names a workable alternative.

## ADDED Requirements

### Requirement: Friendly region resolution
Every region parameter SHALL accept a region id, the calculator's display name, or a curated
city/country alias, matched case- and accent-insensitively (for example "Santiago" or "Chile" →
`la-south-2`, "São Paulo" or "Brazil" → `sa-brazil-1`, "Mexico City2" → `la-north-2`).

#### Scenario: Accented alias
- **WHEN** a caller passes region "São Paulo"
- **THEN** it resolves to `sa-brazil-1`

### Requirement: Ambiguity and unknowns are errors
A query matching more than one region SHALL fail with `REGION_AMBIGUOUS` listing the candidate
ids, unless the query exactly equals one candidate id. A query matching none SHALL fail with
`REGION_NOT_FOUND` and an example of a valid value.

#### Scenario: Mexico
- **WHEN** a caller passes region "Mexico"
- **THEN** `REGION_AMBIGUOUS` lists `na-mexico-1` and `la-north-2`

#### Scenario: Exact id wins
- **WHEN** a caller passes `la-south-2`, which also substring-matches other entries
- **THEN** it resolves to `la-south-2`

### Requirement: Service must be sold in the region
Before building, the system SHALL check that the service is sold in the region (from the
menu's region list) and otherwise fail with `SERVICE_NOT_SOLD`, listing regions where it is sold.

#### Scenario: Service not sold in the region
- **WHEN** a card is requested for a service whose menu entry does not list the region (for example SFS capacity-oriented, `sfs`, in `la-south-2`)
- **THEN** `SERVICE_NOT_SOLD` is raised and its hint lists regions where it is sold, such as `sa-brazil-1`

### Requirement: Billing mode must be offered in the region
The system SHALL check the requested mode against the modes the region offers for the service
(`PERIOD`, `ONDEMAND`, `RI`), treating monthly and yearly as `PERIOD`, and fail with
`MODE_NOT_OFFERED` listing the offered modes.

#### Scenario: RI not offered
- **WHEN** RI is requested for a service whose region entry offers only `PERIOD` and `ONDEMAND`
- **THEN** `MODE_NOT_OFFERED` lists `PERIOD, ONDEMAND`

### Requirement: Missing spec suggests the closest ones
A spec absent from the region's catalog SHALL fail with `SPEC_NOT_FOUND` whose hint lists up to 5
closest specs from that region.

#### Scenario: Flavor not sold
- **WHEN** `c7.large.2` is requested in a region that only sells `c7n.*`
- **THEN** the hint lists up to five `c7n` flavors

### Requirement: Region-specific options and prices
Service discovery for a region SHALL report whether the service is sold there, the modes
offered, and the catalog groups with sample specs for that region only. Prices SHALL always be
rated for the requested region; one region's price SHALL NOT be reused for another.

#### Scenario: Same SKU, different price
- **WHEN** `c7n.large.2` monthly is quoted in Santiago and São Paulo
- **THEN** each total comes from its own region's rating
