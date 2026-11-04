# Architecture

## The problem in one paragraph

Cloud pricing calculators are single-page web apps with undocumented backends. Reading
their catalogs and prices is easy: anonymous JSON endpoints answer quickly. *Writing* a quote
that the website itself will display and **re-price identically on Edit** is hard. Each
service's card is built by service-specific JavaScript from form state that differs per region.
autocalc separates the easy, fast part (catalog and rating) from the hard, slow part
(encoding and verifying a saved list).

## Layers

```
agent / human
   │  plan_quote → apply_quote        (a quote file: YAML of cards)
   │  draft_quote → revise_quote → publish_quote
   │  one tool registry → MCP + CLI
   ▼
1. declarative layer         src/core/compiler/
   quote.yaml (version "1": units, templates) → offline compiler → expander
   │  deterministic, no network
   ▼
2. canonical layer           src/core/quote/ · quote-file.ts · quote.lock.yaml
   provider-neutral model (requirement, candidate, decision, quote)
   ranking policy · draft store · run records · lock file
   │  Provider protocol: catalog · rank · rate · encode · publish · verify · delete
   ▼
3. vendor layer              src/providers/huawei.ts · src/core/{catalog,pricing,page,gate}
   catalog + rating API (fast, anonymous)
   page encoder (headless calculator form) · generated card schemas (src/schema/)
   publish gate: stored = rated = Edit, or the list is deleted
   wire budgeting, partitioning, circuit breaker
```

The layers keep intent away from the vendor's page: a change to the calculator's controls is
absorbed by layer 3 (a regenerated schema), and quote files do not change
([ADR-0018](../adr/0018-declarative-quotes-and-generated-card-schema.md)). The core is
provider-neutral so a second provider can be added later
([ADR-0015](../adr/0015-strangler-core-and-aws-second.md)); AWS is v2. The implementation is
TypeScript on Bun ([ADR-0017](../adr/0017-typescript-on-bun-is-the-target.md)).

## Where each kind of knowledge lives

| Knowledge | Home |
|---|---|
| What the system must do, as testable requirements | `openspec/specs/` (provider-neutral at the top, `huawei/…` for Huawei behavior) |
| Why a direction was chosen | [ADRs](../adr/index.md) |
| How the vendor's calculator behaves (observations, measurements, traps) | the [Huawei calculator](huawei/edit-vs-list-price.md) pages in this section |
| Exact endpoints and payloads | [Reference: Huawei calculator backend](../reference/huawei-backend.md) |

A vendor observation, such as which cookie authenticates or what a rate limit looks like, is
not a requirement. It goes here, and the spec states only the behavior autocalc guarantees.
