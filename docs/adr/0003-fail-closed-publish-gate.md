---
status: accepted
date: 2026-10-16
---

# Fail-closed publish gate

## Context and Problem Statement

Real use produced lists whose stored total differed from the Edit total. For example, an
ECS card stored at 10,480.39 re-priced to 9,831.28 on Edit, because the editor dropped two data
disks. The offline golden tests compare products but not the form state, so they did not catch
it. How do we make sure a link we hand out is right?

## Considered Options

* Trust the builder and the golden tests.
* Re-read the saved list and validate its arithmetic only.
* **Gate:** re-read anonymously and compare with the rating engine, *and* open each card's
  Edit view headless and compare the recomputed price; delete the list on any mismatch.

## Decision Outcome

Chosen option: **the gate**. After saving, autocalc:

1. re-reads the list anonymously;
2. validates it, and compares every card with a fresh rating-engine price;
3. runs a headless Edit check per card.

On any failure it **deletes the list** and returns a structured, per-card diff.
`--keep-on-fail` exists for debugging only.

### Consequences

* Good, because a link that reaches a customer has been checked by the website itself.
* Bad, because publishing takes longer (a browser per card). Checks run in isolated browser
  contexts in parallel (ADR-0010).
* Neutral: `autocalc selftest` runs the same gate on the user's own account, opt-in, and states
  up front what it will create and delete.
