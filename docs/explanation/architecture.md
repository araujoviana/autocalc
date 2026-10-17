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
   │  draft_quote → revise_quote → publish_quote      (one tool registry → MCP + CLI)
   ▼
provider-neutral core
   model (requirement, candidate, line item, decision, quote)
   ranking policy · draft store · run records
   │  Provider protocol: catalog · rank · rate · encode · publish · verify · delete
   ▼
huawei/  (today)                           aws/  (v2)
   catalog + rating API (fast, anonymous)
   page encoder (headless calculator form)
   saved lists + publish gate
```

Today's code is the bottom-left box with no core above it. The core is being introduced as a
strangler around it ([ADR-0015](../adr/0015-strangler-core-and-aws-second.md)).

## Where each kind of knowledge lives

| Knowledge | Home |
|---|---|
| What the system must do, as testable requirements | `openspec/specs/` (provider-neutral at the top, `huawei/…` for Huawei behavior) |
| Why a direction was chosen | [ADRs](../adr/index.md) |
| How the vendor's calculator behaves (observations, measurements, traps) | the [Huawei calculator](huawei/edit-vs-list-price.md) pages in this section |
| Exact endpoints and payloads | [Reference: Huawei calculator backend](../reference/huawei-backend.md) |

A vendor observation, such as which cookie authenticates or what a rate limit looks like, is
not a requirement. It goes here, and the spec states only the behavior autocalc guarantees.
