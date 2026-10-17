---
status: accepted
date: 2026-10-16
---

# MCP output: shape-dependent format with a token budget

## Context and Problem Statement

Tool results go into the agent's context window, and large JSON results are slow and costly.
One suggestion was to return TypeScript-style literals instead of JSON. We measured the
alternatives on a real `search_skus` result (o200k tokenizer as a proxy):

| Format | Tokens |
|---|---|
| indented JSON | 3345 |
| TypeScript literal | 3060 |
| compact JSON | 2400 |
| tabular text | 1461 |
| tabular text, curated columns | 794 |

## Considered Options

* Indented JSON everywhere.
* TypeScript literals.
* Shape-dependent: tabular text with curated columns for collections, compact JSON for
  single objects.

## Decision Outcome

Chosen option: **shape-dependent output**:
* Collections are rendered as tabular text with curated columns.
* Objects are rendered as compact JSON.
* Every tool has a **token budget**, and a test asserts that the tool stays within it.

TypeScript literals save only about 9% and give up JSON's unambiguous parsing.

### Consequences

* Good, because results are about 4× smaller for the biggest tools.
* Bad, because curated columns hide fields. Detail tools return the full object on request.
