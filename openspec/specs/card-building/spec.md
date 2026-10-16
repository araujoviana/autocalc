# card-building Specification

## Purpose

Turn high-level service options into saved-list cards that the Huawei Cloud calculator website
renders, and edits, exactly like cards a human builds in the UI, priced to the cent.

## Requirements

### Requirement: Card shape matches real saved lists
Each card SHALL be `{buyUrl, rewriteValue, selectedProduct}`. Each product in
`selectedProduct.productAllInfos` SHALL be the region's catalog SKU without `planList`, plus
`bakPlanList` (the plans of the chosen mode), the chosen plan's fields flattened in, and the UI
fields `productNum`, `inquiryTag`, `selectIndex` (0..n-1) and the `addToList_*` label tokens.

#### Scenario: Monthly EVS card
- **WHEN** a monthly 100 GB SSD EVS card is built
- **THEN** its product has no `planList`, its `bakPlanList` holds only MONTHLY/YEARLY plans, and `billingMode` is `MONTHLY`

### Requirement: Card amounts equal the rating engine
Every priced product SHALL carry the rating engine's `inquiryResult` for exactly that product.
Unpriced companion lines (for example an ECS image with `inquiryTag` `localImage`) SHALL carry a
zero result. The card's `amount`, `discountAmount` and `originalAmount` SHALL equal the sum
over its products.

#### Scenario: Card total
- **WHEN** an ECS card with VM, image, system disk and one data disk is built
- **THEN** the card amount equals the sum of the four products' `inquiryResult.amount`, with the image contributing 0

### Requirement: Edit price equals list price
Each card's `rewriteValue.template_RENDER` SHALL be complete enough that the website's Edit
view, which re-prices from the template rather than from the stored products, produces the
same price as the saved card.

#### Scenario: Corpus template reproduced
- **WHEN** a builder rebuilds a corpus card from its options
- **THEN** its `template_RENDER` equals the corpus card's, ignoring label-only fields (measure names, trans rate/target)

### Requirement: ECS data disks survive Edit
An ECS card SHALL carry one `calculator_evs_stepper_|addible0|_<k>` render entry per data disk,
with a unique `<k>`, and SHALL mark data-disk products `_productType: "addible"`. Only the system
disk is `"main"`.

#### Scenario: Two data disks
- **WHEN** an ECS card is built with two 50 GB data disks
- **THEN** the render template has two addible stepper entries and both disk products are `addible`

### Requirement: No implicit public IP on ECS
An ECS card SHALL include an EIP/bandwidth product only when the caller passes a bandwidth (or
selects a traffic-billed EIP), in every billing mode including RI.

#### Scenario: Bandwidth omitted
- **WHEN** an ECS card is built in monthly or RI mode without `bandwidth_mbit`
- **THEN** the card has no bandwidth or EIP product

### Requirement: Label tokens come from the target region
Display tokens (`addToList_title`, `addToList_product`, `specName`, `storageType`,
`architectureName`, `measureId`) SHALL be taken from the target region's catalog or the
service's config bundle. Tokens from another region SHALL NOT be hard-coded, and tokens for
services with no real saved card SHALL NOT be guessed.

#### Scenario: Unknown token
- **WHEN** a new service has no corpus card and its token is not found in the bundle or config
- **THEN** no builder is shipped for it until the token is recovered and a published card reads back correctly

### Requirement: RI cards carry selected-level aggregates
An RI card's `selectedProduct` SHALL carry `perAmount`, `installAmount`, `perDiscountAmount` and
`perOriginalAmount`, or the website shows NaN. Period and on-demand cards SHALL NOT carry them.
RI amounts SHALL follow `amount = perPrice × qty × installMonths` (12 for `1_3`, 36 for `3_3`).

#### Scenario: 1-year RI card
- **WHEN** a 1-year no-upfront RI ECS card is built
- **THEN** `selectedProduct.perAmount` is present and `amount` equals perAmount x 12

### Requirement: RI exists only where the catalog offers it
The RI mode SHALL be offered only for services whose catalog has `billingMode == "RI"` plans
(ECS today). For ECS flavors with no YEARLY plan, a yearly request SHALL fail with an error, and
RI is the 1-year basis.

#### Scenario: Flavor without a yearly plan
- **WHEN** a yearly ECS card is requested for a flavor whose catalog has no YEARLY plan
- **THEN** the build fails naming the missing YEARLY price

### Requirement: One card per unit where the UI has no quantity control
For services whose card has no quantity stepper (ELB, CCI, APIG), N units SHALL be represented
as N cards each with quantity 1, because a stored quantity above 1 collapses to 1 on Edit.

#### Scenario: Three load balancers
- **WHEN** a caller asks for 3 shared ELBs
- **THEN** the list contains 3 ELB cards and the total is 3x one ELB

### Requirement: DMS instance pricing uses conversion rates
RabbitMQ and Kafka instance lines SHALL carry `resourceSize = conversion_rate(specId) × brokers`
with the rate from the service config bundle. Storage SHALL be priced linearly per broker.
Broker counts SHALL be 1 for single-node and 3, 5 or 7 for cluster specs.

#### Scenario: Kafka 3 brokers
- **WHEN** a Kafka card is built with a cluster spec and 3 brokers
- **THEN** the instance line's `resourceSize` equals the spec's rate times 3

### Requirement: OBS packages emit only SKUs the region sells
An OBS prepaid package card SHALL emit the storage-package SKU and SHALL add the outbound-traffic
package SKU only in regions whose catalog sells it.

#### Scenario: Santiago package
- **WHEN** an OBS 1 TB yearly package is built in `la-south-2`
- **THEN** the card has only the storage SKU

### Requirement: Usage units follow the calculator
FunctionGraph request usage SHALL be stored in millions of requests (measure 32). OBS on-demand
storage SHALL be stored per hour of the month. The FunctionGraph compute (GB-s) line is priced 0
by the intl rating engine in every region tested; this SHALL be surfaced as a known gap.

#### Scenario: Ten million requests
- **WHEN** a FunctionGraph card is built with 10,000,000 requests
- **THEN** the request line's `usageValue` is 10

### Requirement: Unknown service is a validation error
Building a card for a service without a builder SHALL fail with a `VALIDATION` error listing the
services that have builders.

#### Scenario: No builder
- **WHEN** a card is requested for `dds`
- **THEN** a `VALIDATION` error lists the supported service codes

### Requirement: List totals and settlement
A list's `totalPrice` SHALL equal the sum of its cards. Generic card titles SHALL be renumbered
`custom.<service> <n>` in list order. The list SHALL use settlement `billingModeTotal` by default,
or `billingModeMonth` when monthly settlement is requested.

#### Scenario: Two cards
- **WHEN** a list is built from an ECS card and an EVS card
- **THEN** `totalPrice.amount` is their sum and the titles are `custom.ecs 1` and `custom.evs 2`

### Requirement: Builders reproduce the saved-list corpus
Every builder SHALL rebuild the corpus cards of its service from their high-level options and
match them field-for-field, ignoring `timeTag`, `_cartId` and `inquiryResult.id`. A miss SHALL
be explainable as catalog drift (a delisted flavor or image, a changed RI price) or a documented
gap.

#### Scenario: Golden run
- **WHEN** the golden suite runs against the corpus
- **THEN** every EVS, CCE, OBS, RDS, ELB and SFS Turbo card matches, and every ECS miss is attributed to drift or a documented gap
