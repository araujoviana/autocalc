# Known caveats and workarounds

Rules learned the hard way while reverse-engineering Huawei's price calculator. Read this
before building or editing cards — several of these cost real debugging time. Nothing here is
client-specific; client data never belongs in this repo.

> **The contract lives in `openspec/specs/`.** This file is the rationale: the bugs and
> measurements behind each rule. Each section names the spec requirement it explains; change
> behavior through an OpenSpec change (`/opsx:propose`), then update the story here if useful.

## The list price and the Edit price are computed differently

*Spec: card-building › Edit price equals list price; ECS data disks survive Edit*

The saved list (and the anonymous share link) shows each card's stored `amount`. Clicking
**Edit** makes the SPA *recompute* the price from `rewriteValue.template_RENDER` — **not**
from `productAllInfos`. If the render template is incomplete (or carries a token from another
region/catalog), the Edit price silently differs from the saved one and a Save would corrupt
the card. **Every saved card must carry the portal's real `template_RENDER`.**

Two things an ECS card must carry, or the editor drops disks:

* **one `calculator_evs_stepper_|addible0|_<k>` entry per data disk** (the trailing id just
  has to be unique; real cards use `_0` or `_1`), and
* **data-disk products marked `_productType: "addible"`** (only the system disk is `"main"`).

Symptom seen in the wild: stored `10480.39`, Edit `9831.28` = VM `9182.16` + system disk
`649.12` — the editor priced only the system disk and lost both 50 GB data disks.

**The golden suite does not catch this:** `tests/golden.compare_cards` ignores `rewriteValue`
(and other volatile keys), so a card with a broken render template still "matches". Cover it
with `tests/test_template_render.py` + `tests/template_audit.py`, and check new services by
hand.

## Token rule: never hard-code a display token from another region

*Spec: card-building › Label tokens come from the target region*

The opaque label tokens (`addToList_title`, `addToList_product`, `specName`, `storageType`,
`architectureName`, `measureId`) are **per region/catalog**. Hard-coding an `ap-southeast-1`
token produced the OBS Edit bug (below). Always derive tokens from the target region's own
catalog and, for global labels, from the service config bundle:

```
GET /config?urlPath=<service>&language=en-us&sign=common
```

That bundle is also where non-obvious pricing constants live (e.g. DMS conversion-rate maps).
The build-your-own source of truth for the whole render model is
`docs/evidence/bundle/framework.js`.

## The list price and Edit price — service-specific traps

*Spec: card-building › OBS packages emit only SKUs the region sells; DMS instance pricing uses conversion rates; Usage units follow the calculator; One card per unit where the UI has no quantity control; RI exists only where the catalog offers it*

* **OBS prepaid packages.** The package card must emit the **storage SKU only**, and add the
  outbound-traffic SKU **only where the region actually sells it** (ap-southeast-1 sells a
  `dataInfo_11_` traffic package; `la-south-2` / `sa-brazil-1` do **not**). Emitting the
  traffic SKU everywhere made Edit re-price against a phantom SKU.
* **DMS RabbitMQ / Kafka.** The catalog's `productInfo` returns the *same* plan price for
  every `specId`, so it can't be used raw. The real model is
  `instance amount = plan * resourceSize`, where `resourceSize = conversion_rate(specId) * brokers`
  and the rate map lives in `GET /config?urlPath=<rabbitMQ|kafka>`
  (e.g. `c6.2u4g.single=7 … c6.24u48g.single=75`; cluster variants differ). Storage is linear
  per 1000 GB. Broker counts: single `[1]`, cluster `[3,5,7]`. Verified exact against live cards.
* **FunctionGraph.** **Both** usage lines price correctly — request (usage in millions of
  requests, `requests / 1e6`, measure 32) and compute (GB-seconds, measure 39). The compute line
  *looks* like it always returns 0: it doesn't. The default usage sits exactly at the free tier
  (first 1M requests and 400,000 GB-s per month are free), so any usage at or below that prices to
  0. Supply real `requests * duration_s * memory_gb` to get a real compute price. The portal UI
  takes Average Requests (in **ten-thousands**), Average Execution Duration (ms) and Memory (MB).
* **No quantity stepper ⇒ one card per unit.** ELB and CCI cards have no quantity control;
  saving `productNum > 1` makes Edit collapse to 1. Emit **N cards** (one per LB / per container)
  instead of one card with quantity N.
* **APIG has no yearly mode** ⇒ bill pay-per-use over 8760 h. BASIC ≈ 6,657.60/yr (0.76/h).
* **ECS yearly goes through RI.** Most ECS flavors expose yearly only as a Reserved-Instance
  plan; some flavors have **no** `YEARLY` billing plan at all (e.g. `x1.2u.4g`) — for those use
  `build_ri`, not a yearly-billed `build`.

## Not every service has RI — but most have a cheaper yearly plan

*Spec: card-building › RI exists only where the catalog offers it*

Only ECS (and HECS) expose a Reserved-Instance plan. CCE, RDS, SFS, OBS and ELB have no
`billingMode == "RI"` plan — but that does **not** mean they lack a 1-year basis: they all
offer YEARLY plans/packages. Check **every** plan, not just the first item:
`product_info(service, region)["product"][group][i]["planList"]` for `billingMode`. Yearly is
usually 10x monthly (two months free) — e.g. RDS `rds.pg.x1.large.4` monthly 105.6 vs yearly 1056.

A typical non-RI quote bills:

| Item | Billing | Why |
|---|---|---|
| EKS control plane -> CCE cluster | **Yearly** | yearly = 10x monthly (2 months free); no RI exists |
| RDS PostgreSQL | **Yearly** | yearly = 10x monthly; monthly over-quotes |
| FSx -> SFS Turbo | **Yearly** | yearly is the discounted basis |
| S3 -> OBS | **Yearly** (prepaid package) | pick the closest package that COVERS the usage — more, never less. OBS packages: 40 GB / 100 GB / 500 GB / 1 / 2 / 5 / 10 / 20 / 50 / 100 / 200 / 300 TB |
| NLB/ALB -> ELB | **Yearly** | yearly ≈ 9.7x monthly (203 vs 252/yr) |

## Region-specific availability and prices

*Spec: region-availability › Service must be sold in the region; Region-specific options and prices*

* **Availability:** not every service is sold in every region (`services()[..]['regions']`).
  e.g. DIS (Data Ingestion Service) is only in `ap-southeast-1/2/3` — check before mapping.
* **Price:** the *same* SKU can differ by region — e.g. CCI 1 vCPU / 2 GiB / 8760 h is ≈388/yr
  in `la-south-2` but ≈669/yr in `sa-brazil-1`. Never reuse one region's price for another.

## Sizing rules of thumb (no client data)

*Spec: none (quoting guidance, not tool behavior)*

* SFS Turbo has a calculator minimum on the 20 MB/s tier (~3.6 TiB = 3,686 GB); the `standard`
  tier allows smaller.
* CBR ≈ USD 0.359/GB/yr; it prices the vault size you give it.
* Model a "one instance hosts many objects" service as **one instance**, not N (an APIG instance
  hosts many APIs; a RabbitMQ/Kafka instance hosts many queues/topics). Genuinely per-instance
  resources (each ELB, each RDS/Aurora cluster, each ECS task) stay per-instance.

## Grepping the rendered page for "NaN" gives false positives

*Spec: saved-lists-and-auth › Saved-list validation*

The substring `nan` occurs inside "Gover**nan**ce" and base64 font blobs, and `undefined`
occurs in script tags. Scan for the *tokens* `NaN`/`undefined`/`Infinity` as standalone values,
or better: `autocalc validate <shareListId>` re-reads the list anonymously and reports real
non-finite numbers, missing money fields, RI cards missing their aggregates, and card/list
totals that disagree with the sum of their parts.

## ECS cards must not carry a default EIP

*Spec: card-building › No implicit public IP on ECS*

Bandwidth is **opt-in**: `EcsBuilder.build` and `build_ri` both default `bandwidth_mbit` to
`None`, so a card gets an EIP only when the caller asks for one. Only set it when the instance
really needs a public IP.

**History (fixed in `99fa96d`, 2026-10-15):** `build` used to default to a 5 Mbit/s EIP and
forwarded that default to `build_ri`, so every ECS card built through `create_price_list`
without an explicit bandwidth, RI included, carried one. Measured 2026-10-15, a 5 Mbit/s
`19_bgp` EIP costs **USD 45.00/month** in `sa-brazil-1` (40.08 in `la-south-2`),
**450.00/year**, or 102.57 for a 730 h on-demand month, *per card* (an earlier note here said
~3.69, which was wrong). Lists built before the fix should be audited for unintended EIP lines.

## RI cards must carry the selected-level aggregates

*Spec: card-building › RI cards carry selected-level aggregates*

An RI card whose `selectedProduct` lacks `perAmount`, `installAmount`, `perDiscountAmount` and
`perOriginalAmount` renders `NaN` in the Monthly Cost. `base._totals` copies them from the
products only when the products actually have them (period/on-demand cards must NOT carry
them — the corpus omits them). RI pricing is `amount = perPrice * qty * installMonths`
(installMonths 12 for `1_3`, 36 for `3_3`); `perAmount = perPrice * qty`.

## eip / vpn bandwidth specs drifted

*Spec: card-building › Builders reproduce the saved-list corpus*

Old cards reference `12_bgp` / `19_share` bandwidth specs; the calculator replaced them with
traffic packages (`12_bgp_<N>GB`). Old cards therefore cannot round-trip — model EIP/VPN
against the current package specs.

## RDS engine version token

*Spec: card-building › Label tokens come from the target region*

A volumetria may say PostgreSQL 17.x, but the calculator's newest PostgreSQL token renders as
**18** and there is no 17 token, so RDS lines show PG 18 — the RDS price line is independent of
the engine version. Real saved lists use the token `dataInfo_107_`.

## Services with no corpus card

*Spec: card-building › Label tokens come from the target region*

`eip, vpn, sfs (NAS), cci, nosql, dds, rabbitMQ, kafka, dis, aom, hss, ssa, er, dli, eg` may
have no real saved card yet. Their display labels come from two opaque tokens
(`addToList_title`/`addToList_product`); **do not guess them** — recover them from
`docs/evidence/bundle/framework.js` (or the service `/config` bundle), then verify by
publishing a card and reading it back.

## Catalog drift is expected in golden tests

*Spec: card-building › Builders reproduce the saved-list corpus*

Misses in the golden suite are usually drift, not bugs: a flavor no longer sold, or an RI plan
whose price changed since the list was saved (or an OS-image version the portal delisted).
Re-pull the fixtures or ignore the drift.

## Provider rate limits — do not fan out

*Spec: rating › Polite, sequential use*

The calculator API rate-limits aggressively under parallel load (HTTP 429, "4 per second" /
"1000000 tokens per minute"). Build and publish **sequentially**; parallel subagents get killed.

## Sessions and secrets

*Spec: saved-lists-and-auth › Session storage is protected; HWS_INTL_ID authenticates*

The `HWS_INTL_ID` cookie alone authenticates `share/list`, `share/add` and `share/detail`
(`cbc-sid` alone does not). It is stored in the OS keyring, or in
`~/.config/autocalc/session.json` (0600) on hosts without a Secret Service (e.g. WSL).
`.session.curl` and `tests/fixtures/corpus/` are gitignored — never commit them, and never
commit client-generated scripts or notes (keep those outside the repo).
