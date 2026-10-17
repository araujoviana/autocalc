---
status: accepted
date: 2026-10-16
---

# Saved lists are named `[autocalc] <customer> – <date>`, with `prune`

## Context and Problem Statement

Every share link is a saved list in the user's account (there is no anonymous save). Drafts,
self-tests and failed gates could clutter the account, and lists made by autocalc must be
easy to tell apart from hand-made ones.

## Considered Options

* Free-form names.
* A fixed prefix and format, plus a cleanup command.

## Decision Outcome

Chosen option: lists created by autocalc are named **`[autocalc] <customer> – <date>`**.
Self-test lists use **`[autocalc-selftest]`** and are deleted by the test itself.
`autocalc prune` lists autocalc-created lists by age and deletes only the ones the user
confirms. It never touches lists without the prefix.

### Consequences

* Good, because autocalc's lists are recognizable and cleanable without risk to hand-made ones.
* Bad, because a user who renames a list removes it from `prune`'s view. That is intended.
