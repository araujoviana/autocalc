## Why

Five wave-3 services (ga, cc, aad, edgesec, ucs) have global calculator pages with no region
control, so the encoder failed on the region step before filling anything. They are quotable and
priced; skipping the step lets them reach v1 (47 of 93).

## What Changes

- A form recipe may be marked `regionless`; for it the encoder skips the region step.
- The five services are run live and added to `VERIFIED`.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `huawei/page-encoding`: the region step is skipped for pages that have no region control.

## Impact

- `page/replay.py` (`card_steps`), `services/forms.py`, `VERIFIED`, docs. Publish gate unchanged.
