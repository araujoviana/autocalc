# Proposal

## Why

In about 1 of 8 encodes of the same card (redis, yearly, `la-south-2`) the calculator page returns a
card whose `selectedProduct.region` is `ap-southeast-1`: different product ids and a different price
(8.99 instead of 10.60). Nothing notices. The card's echoed form state (`rewriteValue`) still says
`la-south-2`, `encode_card` compares only `template_RENDER`, and the publish gate re-prices with the
region read from the card itself. `publish_quote` saves `encode_card`'s output as is, so a card
priced in the wrong region can reach a customer's list.

## What Changes

- After capture, the encoder compares the region and charge mode of the card's priced product
  (`selectedProduct`) with the request, and fails closed on a mismatch.
- A mismatch is retried a bounded number of times, because most attempts come out right.
- The region sweep treats the new failure as retryable too.
- Period and quantity are not in this change (see design): their mapping onto `selectedProduct` is unverified.

## Capabilities

### New Capabilities

### Modified Capabilities
- `huawei/page-encoding`: the encoder also verifies where the card was priced.

## Impact

- `src/autocalc/page/replay.py` (`encode_card`): a check after capture and a bounded retry loop.
- `tests/support/region_sweep.py`: add the new step to the retried steps.
- Tests: offline tests for the check and the retry; no new dependency.
- Slower worst case: up to 3 page loads for a card the page gets wrong.
