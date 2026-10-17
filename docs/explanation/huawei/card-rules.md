# Card rules by service

*Specs: `huawei/card-encoding` › OBS packages emit only SKUs the region sells; DMS instance
pricing uses conversion rates; Usage units follow the calculator; One card per unit where the UI
has no quantity control; No implicit public IP on ECS; RI cards carry selected-level aggregates*

Each of these rules was learned from a broken card.

## OBS prepaid packages

A package card emits the **storage SKU**. It adds the outbound-traffic package SKU **only where
the region sells one**: `ap-southeast-1` does, and `la-south-2` and `sa-brazil-1` do not.
Emitting it everywhere made Edit re-price against a SKU that doesn't exist.

## DMS (RabbitMQ, Kafka) instances

The catalog returns the *same* plan price for every instance spec, so it can't be used as is.
The real model is:

```
instance amount = plan price × resourceSize
resourceSize    = conversion_rate(specId) × brokers
```

The rate map lives in the service config bundle (`/config?urlPath=rabbitMQ|kafka`). Storage is
linear per 1000 GB. Broker counts are 1 for single-node specs and 3, 5 or 7 for cluster specs.

## FunctionGraph usage lines

- **Requests** are stored in millions (measure 32): 10,000,000 requests are stored as `10`.
- **Compute** is in GB-seconds (measure 39).

!!! note "Open question"
    The `huawei/card-encoding` spec says the compute line is priced 0 by the rating engine and
    must be surfaced as a known gap. A later observation found it prices correctly above the
    free tier (1M requests and 400,000 GB-s per month), and the default usage sits exactly at
    that tier. Which statement holds will be settled when FunctionGraph is migrated to the page
    encoder; until then the spec stands.

The website's form takes Average Requests in **ten-thousands**, Average Execution Duration in
ms, and Memory in MB.

## No quantity control ⇒ one card per unit

ELB, CCI and APIG cards have no quantity stepper. Saving `productNum > 1` makes Edit collapse it
to 1, so N units are N cards with quantity 1.

## ECS public IP is opt-in

An ECS card gets an EIP/bandwidth product only when the caller asks for one, in every billing
mode including RI. Until 2026-10-15, `build` defaulted to a 5 Mbit/s EIP and passed that default
on to RI, so every ECS card built without an explicit bandwidth carried one. A 5 Mbit/s `19_bgp`
EIP costs USD 45.00/month in `sa-brazil-1` (40.08 in `la-south-2`). Lists built before that
fix should be checked for unintended EIP lines.

## RI cards need selected-level aggregates

An RI card whose `selectedProduct` lacks `perAmount`, `installAmount`, `perDiscountAmount` and
`perOriginalAmount` shows `NaN` as its monthly cost. Period and on-demand cards must *not* carry
them. RI pricing:

```
amount    = perPrice × qty × installMonths   (12 for "1_3", 36 for "3_3")
perAmount = perPrice × qty
```

## Checking a saved list for these glitches

Searching the rendered page for "NaN" gives false positives. The substring occurs inside
"Gover**nan**ce" and in font blobs, and `undefined` occurs in script tags. Instead,
`autocalc validate <shareListId>` re-reads the list anonymously and reports:
- real non-finite numbers;
- missing money fields;
- RI cards missing their aggregates;
- totals that disagree with the sum of their parts.
