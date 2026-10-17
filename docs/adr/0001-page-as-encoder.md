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
