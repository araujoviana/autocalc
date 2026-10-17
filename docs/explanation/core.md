# The quoting core

The core is the part of autocalc that knows nothing about a particular cloud. It turns "4 vCPU /
16 GB in Santiago, monthly" into a draft that records what was asked, what was offered, who chose
what and why. A provider supplies the cloud-specific part. Today that is
`autocalc.providers.huawei.HuaweiProvider`, a thin wrapper over the catalog and availability
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

`draft_quote(provider, customer, requirements, store)` asks the provider for candidates for each
requirement, ranks them and writes the requirement and the ranking to the run record. If the top
candidate is an exact match it records an `auto` decision whose justification is the candidate's
reason. Anything else stays pending. `decide(...)` records the human's choice, after checking that the
spec was among the recorded candidates.

"Exact" is strict: every minimum is met with an equal value and, when the requirement names a
spec, the candidate has that spec. A size-up, a different family or a missing named spec all go
to a human.

## Where files live

Under `AUTOCALC_DATA` (default `~/.local/share/autocalc`): `drafts/<id>.json` and
`runs/<id>.jsonl`. Run records hold customer requirements, so they never leave the machine and
are never committed.

## What is not here yet

The core does not publish, total a draft or expose tools. The tool surface is
`workflow-surface`, the gate is `publish-gate`, and RI billing arrives with the page encoder.
