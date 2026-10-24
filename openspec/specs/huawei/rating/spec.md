# huawei/rating Specification

## Purpose

Price a bill of materials with the Huawei calculator's own live rating engine, so quotes match what the Huawei Cloud website would show, in any billing mode, without login.

## Requirements

### Requirement: Prices come from the live rating engine
Quotes SHALL be priced by the calculator's public rating endpoint
(`ratingservice/v2/inquiry/resource`), not computed locally from catalog prices, and SHALL
need no credentials.

#### Scenario: Monthly quote
- **WHEN** a caller quotes `c7n.large.2.linux` x3 plus 3 x 100 GB SSD in `sa-brazil-1`, monthly
- **THEN** the result carries per-item amounts, a total, the list price and the discount, all from the rating response

### Requirement: Billing mode mapping
Billing modes SHALL map to the rating engine's fields as on-demand → chargingMode 1 /
periodType 4 (hour); monthly → 0 / 2; yearly → 0 / 3; RI → 10 / 3. On-demand SHALL always send
periodNum 1; monthly and yearly SHALL send the requested number of periods.

#### Scenario: Yearly quote for two years
- **WHEN** a caller quotes yearly with periods = 2
- **THEN** the request uses chargingMode 0, periodType 3, periodNum 2

### Requirement: On-demand duration scaling
For on-demand, items billed by Duration SHALL be rated for one hour and scaled by the
requested hours (default 730 = one month). Storage-style usage factors (names starting with
`size`) SHALL also be scaled by hours. Other usage factors (traffic, requests) SHALL be priced
for the given usage value as-is.

#### Scenario: Default month
- **WHEN** an on-demand compute item is quoted without hours
- **THEN** its amount equals the hourly rate times 730

#### Scenario: Traffic is not scaled
- **WHEN** an on-demand OBS egress item is quoted with usage_value 100 GB and hours 730
- **THEN** its amount is the price of 100 GB, not 100 GB x 730

### Requirement: Usage-billed items need a usage value
An on-demand item whose plan's usage factor is not Duration SHALL require a usage value, and
SHALL fail with an actionable error naming the usage factor when it is missing.

#### Scenario: Missing usage value
- **WHEN** an OBS storage item is quoted on-demand with no usage_value
- **THEN** the quote fails with an error naming the item's usage factor

### Requirement: Sized resources carry the API's field names
Items with a capacity SHALL send `resourceSize` and `resouceSizeMeasureId`, keeping the API's
own misspelling, with GB (measure 17) as the default unit.

#### Scenario: Disk size
- **WHEN** a 100 GB disk is quoted
- **THEN** the request product carries `resourceSize: 100` and `resouceSizeMeasureId: 17`

### Requirement: Mode comparison
Comparing modes SHALL price the same items in each requested mode (default on-demand, monthly,
yearly), report each mode's total and monthly equivalent (yearly ÷ 12), and the saving vs
on-demand in percent. A mode that fails SHALL be reported as an error row, not abort the
comparison.

#### Scenario: One mode unavailable
- **WHEN** an item has no yearly plan and modes include yearly
- **THEN** the yearly row carries an error and the other rows are still priced

### Requirement: Region comparison
Comparing regions SHALL price the same items in each requested region, accepting friendly
region names, and SHALL report a per-region error row with code, message and hint where an
item cannot be priced.

#### Scenario: SKU missing in one region
- **WHEN** a spec is sold in São Paulo but not in Santiago
- **THEN** São Paulo has a total and Santiago has an error row with a hint

### Requirement: Upstream failures are retried and typed
Rating calls SHALL be retried with backoff on network errors, timeouts and HTTP 5xx. Huawei
business exceptions SHALL map to typed errors: `CBC.0101` → `AUTH_EXPIRED`; `CBC.0102`,
`CBC.6006`, `CBC.6008` → `SPEC_NOT_FOUND`; `CBC.6001` → `VALIDATION`; anything else →
`UPSTREAM`. Each SHALL carry a fix hint where one is known.

#### Scenario: Spec not found
- **WHEN** the rating engine answers with `exceptionId: CBC.6006`
- **THEN** a `SPEC_NOT_FOUND` error is raised whose hint suggests `search_skus`

### Requirement: Polite, sequential use
Rating reads MAY run in parallel, with at most 4 requests in flight at once. A rating request
that fails with a transport error, HTTP 429 or a 5xx answer SHALL be retried a bounded number of
times with a growing delay before it is reported as `UPSTREAM`. Saving, renaming and deleting
lists on the account SHALL run one at a time. No calculator rate limit has been measured, so the
cap of 4 is a politeness limit, not a known server limit.

#### Scenario: Batch of quotes
- **WHEN** an agent needs to price many items
- **THEN** it batches them into one rating request or prices them with no more than 4 requests in flight

#### Scenario: Throttled
- **WHEN** the rating endpoint answers HTTP 429
- **THEN** the request is retried after a delay and only reported as `UPSTREAM` once the retries are used up

#### Scenario: Account writes
- **WHEN** several lists are to be saved, renamed or deleted
- **THEN** each write finishes before the next starts
