---
status: accepted
date: 2026-10-16
---

# USD list prices only

## Context and Problem Statement

The calculator can show other currencies (using Huawei's published rates) and some accounts
have discounts. Each extra dimension multiplies what the gate must verify, and a discounted
or converted number is easy to misread as the list price.

## Considered Options

* Support currencies and discounts.
* USD list prices only.

## Decision Outcome

Chosen option: **USD list prices only**, always. Discounts and other extras are out of scope
until a new ADR says otherwise. The currency-conversion tool and currency parameters are removed
when the workflow surface is rebuilt.

### Consequences

* Good, because every number autocalc outputs means one thing.
* Bad, because a user who needs another currency converts by hand or in the website.
