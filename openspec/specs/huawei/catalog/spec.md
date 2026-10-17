# huawei/catalog Specification

## Purpose

Read the Huawei Cloud price calculator's public catalog (services, regions, SKUs, list prices, labels and exchange rates) without credentials, quickly and resiliently, so every other Huawei capability has a reliable source of SKUs and display data.

## Requirements

### Requirement: Catalog reads need no credentials
The system SHALL read the service menu, region list, per-region product info, label pack,
service config bundles and exchange rates from the calculator's public intl backend
(`portal-intl.huaweicloud.com`) without any cookie, login or AK/SK.

#### Scenario: Anonymous catalog read
- **WHEN** no session is stored and a caller lists services or searches SKUs
- **THEN** the call succeeds and returns catalog data

### Requirement: Only services with a calculator are listed
The service listing SHALL include only menu entries that have a calculator and are not
hidden, and SHALL report for each its code (`urlPath`), display name, category and the regions
where it is sold.

#### Scenario: Hidden or calculator-less entries are excluded
- **WHEN** the menu contains an entry with `hasCalculator` false or `hideCalculator` true
- **THEN** that entry does not appear in the service listing

### Requirement: Catalog responses are cached
Catalog responses SHALL be cached on disk for 24 hours, keyed by URL and parameters, in
`~/.cache/autocalc` or the directory named by `AUTOCALC_CACHE`. A refresh request SHALL bypass
the cache.

#### Scenario: Second read within TTL hits the cache
- **WHEN** the same product info is requested twice within 24 hours
- **THEN** the second request is served from disk with no network call

### Requirement: CDN mirror fallback
For the menu and per-region product info, the system SHALL try the frontend's static CDN mirror
(`res-static.hc-cdn.cn/pricecalculator/intl/product/...`) first and fall back to the API. It
SHALL raise an `UPSTREAM` error with a `autocalc doctor` hint only when both fail.

#### Scenario: API down, mirror up
- **WHEN** the API endpoint fails and the CDN mirror answers
- **THEN** the catalog read succeeds using the mirror's JSON

#### Scenario: Both sources fail
- **WHEN** neither the mirror nor the API answers
- **THEN** an `UPSTREAM` error is raised whose hint names `autocalc doctor`

### Requirement: Opaque label tokens are resolved for display
SKU descriptions SHALL be shown with the calculator's placeholder tokens (`dataInfo_N_`,
`calc_N_`, `detail_N_`) replaced by the service's label pack text and `BSSUNIT` unit markers
replaced by unit names. Unknown tokens SHALL be left as-is.

#### Scenario: Description with tokens
- **WHEN** a SKU description contains `calc_4_` and `BSSUNIT.pluralUnit.17`
- **THEN** search results show the label text and the plural unit name instead

### Requirement: SKU search
SKU search SHALL filter a service's SKUs in one region by all query terms (case-insensitive,
over group, spec and description), and optionally by billing mode, minimum vCPUs and minimum
memory. Results SHALL be sorted by price in the requested mode (default on-demand), with
unpriced SKUs last, and limited in count.

#### Scenario: Compute filter
- **WHEN** searching ECS in `sa-brazil-1` for "linux" with at least 4 vCPUs and 8 GB
- **THEN** every result has at least 4 vCPUs and 8 GB, and results are sorted cheapest first

### Requirement: Prices are list prices in USD
Catalog prices SHALL be reported as USD list prices per plan (on-demand, monthly, yearly, RI)
with their unit. Account-specific discounts SHALL NOT be reflected.

#### Scenario: Price units
- **WHEN** a SKU has a monthly one-time plan and an on-demand hourly plan
- **THEN** search shows `per: "1 month"` for monthly and the hourly unit plus usage factor for on-demand

### Requirement: Currency conversion uses Huawei's own rates
Conversion from USD SHALL use the calculator's published exchange rates (USD base), collected
across all result pages. An unknown currency SHALL return an error that lists the available
currencies.

#### Scenario: Unknown currency
- **WHEN** converting to a currency code with no published rate
- **THEN** the result is an error that lists the available currency codes
