## ADDED Requirements

### Requirement: Compact SKU search results
`search_skus` SHALL return one flat row per SKU with the spec, a description that omits fields
that do not help choose a spec, and the list price for each billing mode the SKU has, in USD.
It SHALL NOT repeat the service or group on every row. Row order and the filters are unchanged.

#### Scenario: Flat prices
- **WHEN** the agent searches ECS in a region
- **THEN** each row has `spec`, `description`, and `ondemand`, `monthly`, `yearly` amounts where sold

#### Scenario: Smaller result
- **WHEN** the same 30-row search is run before and after
- **THEN** the result is at least 40% smaller

### Requirement: One name for the billing argument
Every tool that takes a billing mode SHALL call the argument `billing`, and `compare_regions`
SHALL report it under `billing` in its result.

#### Scenario: Compare regions
- **WHEN** the agent calls `compare_regions` with `billing: "yearly"`
- **THEN** each region is priced yearly and the result says `billing: "yearly"`
