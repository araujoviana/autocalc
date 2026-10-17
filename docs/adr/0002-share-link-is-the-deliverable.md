---
status: accepted
date: 2026-10-16
---

# The share link is the deliverable

## Context and Problem Statement

Users of autocalc are technical colleagues preparing quotes for customers. What leaves their
hands is a calculator link: the customer opens it, may click **Edit**, and may export it
themselves. What must autocalc produce, and how bad is a wrong number?

## Considered Options

* A price table in chat, with the link optional.
* The share link as the mandatory output; Excel export only on request.
* An Excel export as the primary output.

## Decision Outcome

Chosen option: **the share link is mandatory; Excel export only when asked.** Most people
only need the link and can export it themselves from the website.

A **fidelity bug** (the stored price differs from the price the website shows after Edit, or
from the rating engine) is **fatal**. It is never a warning: the quote must not be handed out.

### Consequences

* Good, because the output is something the customer's own tooling (the website) trusts.
* Good, because "fatal" justifies the cost of the publish gate (ADR-0003).
* Bad, because every quote needs a logged-in account to save the list (ADR-0011).
