# Concurrency

*Specs: `huawei/rating` › Polite, sequential use*

## What was measured (2026-10-16)

- Four ECS ratings sent concurrently returned **the same amounts** as the same four sent one
  at a time: 69.22, 131.24, 93.35 and 312.89. They took **0.89 s instead of 2.12 s**.
- The calculator page itself sends a card's rating requests concurrently and fetches lists in
  parallel for export.
- One rating call takes about 0.5 s when warm. The first catalog reads of a day take about
  2.6 s, mostly the label pack, and are then cached for 24 h.

## What was *not* found

No calculator rate limit has been measured. An older note claimed "HTTP 429, 4 per second"
alongside "1000000 tokens per minute". The second figure is an LLM API limit, so the note most
likely recorded an agent's parallel subagents being throttled, not the calculator.

## The rule

Concurrency is decided by what state an operation touches
([ADR-0010](../../adr/0010-concurrency-by-state.md)):

- **Rating reads** hold no state, so they are safe in parallel (capped at 4 in flight).
- **Browser form filling** shares the page's cart, which lives in browser storage. Run it in
  parallel only in isolated browser contexts.
- **Account writes** (save, rename, delete) always run one at a time.

The manual region sweep (`tests/support/region_sweep.py`) follows this: it fills pages in
`SWEEP_WORKERS` isolated contexts (default 6) and holds rating calls to 4 in flight. The page
settles for about 1.5 s after every step, so the sweep is waiting rather than computing, and
more workers help until the calculator starts timing out page loads. Those timeouts are retried
(three tries, a 30 s limit per load); a form mismatch is not.
