# Architecture Decision Records

Decisions are recorded with the [MADR 4](https://adr.github.io/madr/) minimal template. An
accepted ADR is never edited: a reversal is a new ADR that supersedes it (see
[ADR-0000](0000-record-architecture-decisions.md)).

| # | Decision | Status |
|---|---|---|
| [0000](0000-record-architecture-decisions.md) | Record architecture decisions | accepted |
| [0001](0001-page-as-encoder.md) | Publish by driving the real calculator form ("page as encoder") | accepted |
| [0002](0002-share-link-is-the-deliverable.md) | The share link is the deliverable | accepted |
| [0003](0003-fail-closed-publish-gate.md) | Fail-closed publish gate | accepted |
| [0004](0004-usd-list-prices-only.md) | USD list prices only | accepted |
| [0005](0005-candidate-ranking-and-confirmation.md) | Rank candidates; auto-confirm only on an exact match | accepted |
| [0006](0006-refuse-unsupported-requests.md) | Refuse the whole request if any item is unsupported | accepted |
| [0007](0007-workflow-surface-and-one-registry.md) | Workflow surface: draft → revise → publish, from one tool registry | accepted |
| [0008](0008-mcp-output-format.md) | MCP output: shape-dependent format with a token budget | accepted |
| [0009](0009-traceability-run-records.md) | Traceability: run records with a justification for every decision | accepted |
| [0010](0010-concurrency-by-state.md) | Concurrency by state: parallel reads, isolated forms, sequential writes | accepted |
| [0011](0011-auth-browser-profile-is-the-credential.md) | Auth: the persistent browser profile is the credential | accepted |
| [0012](0012-windows-and-linux.md) | Windows and Linux are both first-class | accepted |
| [0013](0013-distribution-uv-tool-from-git-tags.md) | Distribution: `uv tool install` from git tags, with an update notice | accepted |
| [0014](0014-saved-list-naming-and-prune.md) | Saved lists are named `[autocalc] <customer> – <date>`, with `prune` | superseded by 0016 |
| [0015](0015-strangler-core-and-aws-second.md) | Strangler migration to a provider-neutral core; AWS second | accepted |

New ADR: copy the newest file, take the next number, set `status: proposed` until it is agreed.

| [0016](0016-python-canonical-and-publication-support.md) | Python canonical; publication requires request fidelity; supersedes 0014 | accepted |
