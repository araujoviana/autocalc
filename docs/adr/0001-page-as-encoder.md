---
status: accepted
date: 2026-10-16
---

# Publish by driving the real calculator form ("page as encoder")

## Context and Problem Statement

A saved Huawei calculator card holds two things:
* the priced products (`productAllInfos`);
* the form state the website's **Edit** view re-prices from (`rewriteValue.template_RENDER`).

Reverse engineering the frontend (`CBC-PortalCalculator/11.4.201`) showed that the product
list is *derived* from the form state by per-service JavaScript. Each service config carries
23–119 inline functions, and form layouts differ per service and per region. A hand-written
Python builder has to copy that JavaScript for every service and region. When it gets one detail
wrong, the stored price and the Edit price drift apart: a fatal bug (ADR-0002).

## Considered Options

* **A. Page as encoder.** Drive the real calculator form in headless Chromium, click "Add to
  List", and take the card the page itself built from its own state store.
* **B. Python encoder.** Re-implement each service's form-to-card logic in Python (the
  current builders).
* **C. Execute the service config JS** in an embedded JS runtime without a page.

## Decision Outcome

Chosen option: **A, page as encoder.** Option B stays available as a per-service fallback,
behind the same publish gate (ADR-0003). Drafts and ranking keep using the fast rating API;
only publishing drives the page.

Evidence:
* Anonymous "Add to List" fills the page's cart store with a complete card (form state +
  products). No login is needed and nothing is saved server-side.
* DOM element ids equal the config's component ids, so a per-service recipe can address
  fields by id.

### Consequences

* Good, because the card is produced by the same code the website uses to read it, so Edit
  fidelity follows by construction.
* Good, because supporting a new service becomes a recipe (field ids → values) instead of a
  re-implementation.
* Bad, because publishing needs a browser and takes seconds per card. That is acceptable,
  because publishing happens once per quote.
* Bad, because a frontend redesign can break recipes. The publish gate catches this; nothing
  wrong is ever handed out.

## More Information

A proof of concept on ECS in `sa-brazil-1` gates the migration. Its exit criterion is
stored price == Edit price == rating engine for on-demand, monthly and RI.

### Proof of concept result (2026-10-17): go

Change `spa-encoder-poc`, frontend `CBC-PortalCalculator/11.4.201`. The harness
(`uv run python -m tests.support.spa_poc`) encodes `c7n.large.2` ECS cards on the page in
`sa-brazil-1` (Ubuntu, 40 GB system disk, two 50 GB data disks, 5 Mbit/s bandwidth). It saves
them as one list, re-reads the list anonymously, and runs the [Edit check](../explanation/huawei/page-encoder.md#edit-check)
on every card:

| Billing mode | Stored | Edit | Rating | Result |
|---|---|---|---|---|
| On-demand, 730 h | 213.95 | 213.95 | 213.95 | go |
| Monthly, 1 month | 132.22 | 132.22 | 132.22 | go |
| RI, 1 year, no upfront | 2,205.58 | 2,205.58 | 2,205.58 | go |

Three consecutive runs gave the same table. Encoding the three cards takes about 16 s (in
parallel, each in its own browser context), and the Edit check takes about 20 s for the list.

The check can fail. A negative control saved the Python builder's monthly card with its
data-disk form entries removed. On Edit the page dropped both disks and re-priced 132.22 to
114.22, and the check flagged it.

Compared with the Python builder's cards for the same options, the page cards have the same
`template_RENDER` and the same amounts in all three modes. They differ only in:

* fields only the page writes: `planType`, the `officialWebsite*` and `officialCheap*` amounts
  in `inquiryResult`;
* RI `inquiryResult` extras only the builder writes: `installNum`, `installAmount` and the like;
* the image entry, where the page's live catalog is newer than the builder's 24 h cache;
* `buyUrl`, where the page joins data disks with `;` and the builder with `,`.

Two findings shape the encoder and the publish gate:

* While the form passes through intermediate states (RI chosen before the flavor, an Edit refill
  in progress), the page rates states it can't price. Only a failed inquiry sent for the final
  state may count.
* After Edit, the page's own "No data matched" warning appears in about half the runs even for
  faithful cards. The Edit check uses the page's comparison rule on the final form state
  instead, and reports the warning without acting on it.

### Seven services (2026-10-17): go

Change `spa-encoder`, frontend `CBC-PortalCalculator/11.4.201`. The page replays a Python
builder's form state for ECS, EVS, CCE, ELB, OBS, RDS and SFS Turbo
(`uv run python -m tests.support.spa_matrix`, `sa-brazil-1`). All 14 cards below are saved as one
list, re-read, and checked on Edit:

| Card | Stored | Edit | Rating | Result |
|---|---|---|---|---|
| ecs / monthly | 123.22 | 123.22 | 123.22 | go |
| evs / on-demand, monthly, yearly | 18.03, 18.00, 180.00 | same | same | go |
| cce / on-demand, yearly | 408.80, 912.00 | same | same | go |
| elb / on-demand, yearly | 38.69, 203.00 | same | same | go |
| obs / monthly, yearly (packages) | 6,819.84, 15,344.64 | same | same | go |
| rds / on-demand, yearly | 157.39, 1,034.88 | same | same | go |
| sfsturbo / on-demand, yearly | 255.62, 2,797.67 | same | same | go |

Exception: OBS pay-per-use usage cards encode and price, but the page's Edit view refills their
size stepper with 0 (the builder's card behaves the same), so the publish gate refuses them.
The page also rejects values the builders used to emit (SFS Turbo capacity must be 3.6 TB or more,
in steps of 1.2 TB), which now fails at encode time with the control named. Details in
[page encoder](../explanation/huawei/page-encoder.md).
