---
status: accepted
date: 2026-10-16
---

# Traceability: run records with a justification for every decision

## Context and Problem Statement

When a quote is questioned later, someone needs to know why each SKU, mode and region was
chosen, who chose it (the agent or a human), and what the gate checked.

## Considered Options

* Rely on chat transcripts.
* Log free text.
* Structured, append-only **run records** per quote.

## Decision Outcome

Chosen option: **run records**. Each quote has an append-only JSONL record (local, under the
user data directory) with:
* every requirement and the candidates considered;
* every decision, with `auto|human` and a short, factual justification;
* the gate's results;
* per-step timings.

`autocalc runs show <id>` renders it, timings included as a waterfall.

Justifications are factual and short, for example "covers 4 vCPU/16 GB; cheapest of 3 exact
matches". They never pad.

### Consequences

* Good, because any quote can be explained after the fact, and slow steps are visible.
* Bad, because run records hold customer requirements. They stay on the user's machine and are
  never committed or uploaded.
