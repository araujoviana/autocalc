---
status: accepted
date: 2026-10-16
---

# Rank candidates; auto-confirm only on an exact match

## Context and Problem Statement

Requirements arrive as "4 vCPU / 16 GB in Santiago". Often no SKU matches exactly, or the
requested mode or region isn't offered. In real use, agents silently picked wrong SKUs or modes.
Who decides, and in what order are options presented?

## Considered Options

* The agent picks the cheapest match.
* Tools return unranked lists and the agent reasons freely.
* Tools return a **ranked** list with a reason per candidate; auto-confirm only exact matches.

## Decision Outcome

Chosen option: **ranked candidates**, ordered by:

1. **covers** the requirement (never less than asked);
2. **closest** spec to the requirement;
3. **cheapest**;
4. **newest** generation.

The agent may auto-confirm only an **exact** match. Any deviation goes to the human, who
decides: a size-up, a mode change, a region swap or a different SKU family. Every decision is
recorded with its reason (ADR-0009).

### Consequences

* Good, because the human sees and owns every compromise.
* Bad, because an inexact request needs a round-trip with the human.
