# The quoting core

The core is the part of autocalc that knows nothing about a particular cloud. It turns "4 vCPU /
16 GB in Santiago, monthly" into a draft that records what was asked, what was offered, who chose
what and why. A provider supplies the cloud-specific part. Today that is
`HuaweiProvider` (`src/providers/huawei.ts`), a thin wrapper over the catalog and availability
modules ([ADR-0015](../adr/0015-strangler-core-and-aws-second.md)).

## The pieces

| Piece | What it is |
|---|---|
| `Requirement` | One line of a quote: service, region, billing mode, quantity, numeric minimums (`needs`), and optionally a named `spec` and an availability zone. Region is per line, so a draft can span regions. |
| `Candidate` | A priced SKU a provider offers for a requirement: its numbers (`has`), a USD list price as an exact `Decimal`, and a generation. |
| `rank()` | Orders candidates by covers, then closest, then cheapest, then newest ([ADR-0005](../adr/0005-candidate-ranking-and-confirmation.md)). Each candidate gets a one-line reason built from the compared numbers. |
| `Decision` | The chosen spec for one requirement, made by `auto` or `human`, with a justification. |
| `Draft` | Requirements plus decisions. `pending()` lists the requirements nobody has decided. |
| `DraftStore` | One JSON file per draft under the data directory, replaced atomically. |
| `RunRecord` | An append-only JSONL file per draft: requirements, the top 20 ranked candidates (with the total), decisions and step timings ([ADR-0009](../adr/0009-traceability-run-records.md)). |

## How a draft is made

`draftQuote(provider, customer, requirements, store)` (`src/core/quote/draft.ts`) asks the
provider for candidates for each requirement, ranks them (`rank()` in `src/core/quote/ranking.ts`),
and writes the requirement and top ranked candidates to the run record. If the top
candidate is an exact match it records an `auto` decision whose justification is the candidate's
reason. Anything else stays pending. `decideMany(...)` records human choices after checking that the
spec was among the recorded candidates.

"Exact" is strict: every minimum is met with an equal value and, when the requirement names a
spec, the candidate has that spec. A size-up, a different family or a missing named spec all go
to a human.

## Where files live

Under `AUTOCALC_DATA` (default `~/.local/share/autocalc`): `drafts/<id>.json` and
`runs/<id>.jsonl`. Run records hold customer requirements, so they never leave the machine and
are never committed.

## Pipeline integration (TypeScript on Bun)

Since [ADR-0017](../adr/0017-typescript-on-bun-is-the-target.md), the core drafts, workflow tools,
page encoder, and publish gate live together in one TypeScript codebase on Bun:

- Workflow actions (`draft_quote`, `revise_quote`, `list_drafts`, `inspect_draft`, `recover_draft`) live in `src/core/workflow.ts`.
- Declarative quotes (`version: "1"` YAML + compilation + plan/apply) live in `src/core/quote-file.ts` and `src/core/compiler/`.
- Publication (`src/core/publish.ts`) and the fail-closed 3-way verification gate (`src/core/gate.ts`) support `ondemand`, `monthly`, `yearly`, and ECS `ri` billing.

See [Code Architecture](../architecture.md) for the full `draft → plan → apply → gate → publish` pipeline diagram and concurrency model.
