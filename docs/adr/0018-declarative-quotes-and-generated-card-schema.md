---
status: proposed
date: 2026-11-02
---

# Declarative quotes: a generated card schema, with plan and apply

## Context and Problem Statement

What a service's card accepts lives in hand-written Python (30 `Recipe` dicts, the options of 22
builders) and in the live page. Nobody can see which controls are mapped, and an agent that
needs a legal option value has to read the source, because the MCP lists option *names* only.
A quote is also not a reviewable artifact: it is a draft in a local store (ADR-0007).

The page is already the encoder (ADR-0001), so it can also be the source of truth for what a
card accepts.

## Considered Options

* **Keep hand-written recipes and builders.** Drift stays invisible; agents keep reading source.
* **Schema generated from the page, quotes as declarative files, `plan`/`apply`.**
* **A full crawl of every control value** per region. Too slow and brittle.

## Decision Outcome

Chosen option: **a per-service YAML schema generated from the page and committed, quote files
that declare cards against it, and `plan`/`apply` commands** modeled on Terraform.

* The schema records controls (id, kind, option name, dependencies, ranges). Values that depend
  on region or earlier choices are marked `catalog` and resolved at plan time.
* Hand-written fields (option names, notes, unsupported markers) are kept apart so regeneration
  never loses them.
* `plan` validates offline, resolves requirements through the existing ranking (ADR-0005), rates,
  and reports unmapped options and drift. It does not touch the website.
* `apply` publishes through the existing fail-closed gate (ADR-0003). The schema never replaces
  the Edit check (ADR-0016).
* A lock file pins resolved specs, not prices.
* `draft_quote`, `revise_quote` and `publish_quote` stay (ADR-0007); `plan`/`apply` reuse their
  engine, so there is no second publish path.
* The formats are language-neutral so the Python and TypeScript implementations (ADR-0017) read
  the same files.

State (whether a re-apply updates a saved list in place, and where that state lives) is **not
decided here**. It depends on whether `share/update` keeps the share link when cards change,
which a spike will establish; a later ADR records the result.

### Consequences

* Good, because mapped and unmapped controls become a report instead of a guess.
* Good, because agents read the schema over MCP instead of the source.
* Good, because one set of files serves both implementations.
* Bad, because a generated schema can miss conditionally visible controls; coverage reports
  surface those, and the Edit check still guards every publish.
* Bad, because schema and recipes coexist until they are reconciled; a test keeps them in step.
