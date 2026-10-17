# Publish gate

A share link is the deliverable ([ADR-0002](../../adr/0002-share-link-is-the-deliverable.md)), so
autocalc does not hand one out until the website has agreed with the price it stored
([ADR-0003](../../adr/0003-fail-closed-publish-gate.md)).

## What runs

After a list is saved, three checks run for every card:

1. **Re-read and validate.** The list is read back anonymously, the way a customer would open it,
   and its arithmetic and shape are validated.
2. **Rating.** The card's own stored products are priced again by the rating engine. The result
   must equal the stored amount to the cent.
3. **Edit.** The card is opened in the calculator page's Edit view, headless, which re-prices it
   from the stored form state. The result must equal the stored amount, and the form must come
   back holding the state that was stored ([Page encoder](page-encoder.md)).

If any check fails, or cannot run, the list is deleted and the caller gets `GATE_FAILED` with a
line per card: stored, rated and Edit amounts, and why.

## Failing closed

A card whose Edit view does not open, a browser that does not start, a card the rating engine
cannot price: each of these is a failed card, not a skipped check. A service whose builder
produces cards the page re-prices differently therefore cannot be published until it is fixed.
That is intended: the alternative is a link that shows a different price on Edit.

`AUTOCALC_KEEP_ON_FAIL=1` keeps a failed list so you can open it and look. It is an environment
variable on purpose: no tool argument can turn the gate off.

## What the gate found first

The first live probe, on a list with an ECS, an EVS and an ELB card, passed ECS and ELB and
rejected EVS: the builder used ECS's quantity labels (`calc_29_`, `calc_30_`) where the portal's
own EVS cards use `calc_5_` and `calc_6_`. The form came back from Edit with different labels,
so the page's own comparison failed. Direct Connect had the same defect. Both are fixed.

## Live check

On 2026-10-17 the same three cards (ECS monthly, EVS 100 GB monthly, ELB monthly, `sa-brazil-1`)
were published through the gate twice, with settlement "By total price" and with "By monthly
price" (`billingModeMonth`). Both lists passed, with equal stored, rated and Edit amounts
(69.22, 18.00 and 21.00 per card), in about 27 seconds. The monthly settlement re-prices the same.
The test lists were deleted.

## Cost

Publishing now opens a browser: about 15 seconds per card, run one card after another. Rating
runs up to four at a time. Parallel browser contexts
([ADR-0010](../../adr/0010-concurrency-by-state.md)) are a later optimization.
