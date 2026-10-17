---
status: accepted
date: 2026-10-16
---

# Concurrency by state: parallel reads, isolated forms, sequential writes

## Context and Problem Statement

Quoting is slow, so we want to parallelize. The concern is whether the calculator tolerates
concurrent use. Old notes claimed an HTTP 429 limit of "4 per second" next to "1000000 tokens
per minute". The second figure is an LLM API limit, so the note most likely recorded the agent's
own parallel subagents being throttled, not a calculator limit.

Measured on 2026-10-16:
* Four ECS ratings run concurrently returned **identical amounts** to the same four run
  sequentially, in **0.89 s instead of 2.12 s**.
* The calculator's own page sends a card's rating requests concurrently.
* The page keeps its cart in `localStorage`, which all tabs of one browser profile share.

## Considered Options

* Everything sequential.
* Everything parallel.
* Decide per operation, by what state it touches.

## Decision Outcome

Chosen option: **decide per operation**.

| Operation | State touched | Rule |
|---|---|---|
| Rating (pricing) reads | none | parallel, at most 4 in flight, back off on 429 and 5xx |
| Form filling / Edit checks in a browser | the page's cart in browser storage | parallel only in **isolated browser contexts**, never tabs of one profile |
| Saving, renaming, deleting lists | the user's account | strictly **sequential** |

### Consequences

* Good, because the slow steps (pricing many cards, opening many forms) can overlap.
* Good, because account writes keep a simple, ordered history.
* Neutral: the cap of 4 is a politeness limit, not a measured server limit. Run-record timings
  (ADR-0009) will show throttling if it ever appears.
