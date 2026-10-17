---
status: accepted
date: 2026-10-16
---

# Refuse the whole request if any item is unsupported

## Context and Problem Statement

A quote often mixes services. If one service has no verified encoder, autocalc could publish
the rest, or fill the gap with a price-only line that the website can't edit.

## Considered Options

* Publish the supported part and list the rest separately.
* Add unverified cards for the unsupported part.
* Refuse the whole request, naming the unsupported items.

## Decision Outcome

Chosen option: **refuse the whole request** and name each unsupported item and why. A partial
link looks complete to a customer. That is the same failure as a wrong price (ADR-0002).

### Consequences

* Good, because a link is either the whole quote or nothing.
* Bad, because coverage directly limits usefulness. This is why v1 requires at least half of
  the quotable Huawei services to be verified.
