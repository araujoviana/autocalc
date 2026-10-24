# Proposal

## Why

`huawei/rating` still says callers "SHALL rate and publish sequentially". ADR-0010 (accepted) replaced
that with bounded parallel rating, and the code already does it: the publish gate re-prices cards on
4 workers and the region sweep rates under a 4-in-flight cap. The spec contradicts the shipped behaviour.

## What Changes

- Replace the requirement "Polite, sequential use" with one that allows rating reads in parallel, at
  most 4 in flight, and requires backoff when the endpoint answers 429 or 5xx.
- Keep account writes (save, rename, delete) strictly sequential.
- `Calculator.inquiry` retries transport errors and 5xx but not HTTP 429, so the new requirement is
  not yet true for 429. Add 429 to its retry condition.

## Capabilities

### New Capabilities

### Modified Capabilities
- `huawei/rating`: "Polite, sequential use" becomes bounded-parallel rating with backoff.

## Impact

- `openspec/specs/huawei/rating/spec.md` (via the delta).
- `src/autocalc/client.py` (`Calculator.inquiry`): one more retry condition. No new dependency.
- `docs/explanation/huawei/concurrency.md`: drop the line saying the spec still requires sequential use.
