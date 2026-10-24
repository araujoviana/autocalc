# Design

## Context

`encode_card` (`src/autocalc/page/replay.py`) fills the page and compares each control of the
captured `rewriteValue.template_RENDER` with the request. A card captured in a wrong-region run
had an unchanged `rewriteValue` (still `la-south-2`) and a `selectedProduct` with
`region: ap-southeast-1`, other product ids and a different price. Observed fields on a good
card: `selectedProduct.region`, `chargeMode` (`PERIOD`), `chargeModeName` (`YEARLY`),
`periodType`, `periodNum`, `subscriptionNum`.

## Goals / Non-Goals

**Goals:** never return a card priced in a region or charge mode other than the one requested.

**Non-Goals:** checking period and quantity (`periodType`/`periodNum`/`subscriptionNum` exist, but
how the request's period `measureId` and quantity map onto them is not verified for every service);
finding why the page sometimes prices in another region.

## Decisions

- Compare `selectedProduct.region` and `selectedProduct.chargeMode` with the request's
  `global_REGIONINFO` values, not the echoed `rewriteValue`, which was wrong-region-blind.
  Alternative: compare `rewriteValue.global_REGIONINFO` via `global_values`; rejected because it
  matched in the bad runs.
- Retry inside `encode_card`, three tries in all, only for this mismatch, so every caller
  (`publish_quote`, the sweep) gets it. Alternative: retry in callers; rejected, it would be
  forgotten in the next one.
- Skip the region comparison when the request has no region (regionless recipes).

## Risks / Trade-offs

- Cause unknown: the retry treats the symptom. If the page picks the wrong region more often in
  some services, they take three page loads (about 30 s) before failing.
- The charge-mode value format may differ between services (`PERIOD` against on-demand values);
  the implementation must compare against what the request carries and be tested on an
  on-demand card.

## Open Questions

- Should period and quantity be added once their mapping is checked on a card per service?
