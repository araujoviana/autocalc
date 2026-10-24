# Design

## Context

ADR-0010 already decides the policy. The code follows it for the cap (`gate.RATING_WORKERS = 4`) but
`Calculator.inquiry` (`src/autocalc/client.py`) sleeps and retries only on `httpx.HTTPError` and
5xx, so HTTP 429 raises `UpstreamError` immediately.

## Goals / Non-Goals

**Goals:** make the spec match ADR-0010; make 429 retry like 5xx.

**Non-Goals:** changing the cap, adding a shared rate limiter across processes, honouring
`Retry-After`, retrying the catalog GETs.

## Decisions

- Treat 429 as retryable in the same branches as 5xx, with the existing `0.5 * (attempt + 1)` delay.
  Alternative: honour `Retry-After`; skipped because the calculator sends none that we have seen.
- The spec states the cap and the retry behaviour but not the number of retries (2 today), which can
  change without a spec change.

## Risks / Trade-offs

- The cap is per process. Two processes (for example two sweeps) can exceed 4 in flight together.
- Retried 429s add delay in the worst case; bounded by the existing retry count.
