# Proposal

## Why

ADR-0015 chose a strangler migration: a provider-neutral core first, wrapping today's Huawei
modules, then service-by-service migration. Nothing provider-neutral exists yet. The decisions
that matter most to quote quality (ranked candidates and auto-confirm only on an exact match,
ADR-0005; a justification for every decision, ADR-0009) live only in ADRs, while the code still
lets an agent pick a SKU silently. `workflow-surface` (draft, revise, publish) can't be built
until a model, a ranking, a draft store, run records and a `Provider` interface exist for it to
call.

## What Changes

- New `autocalc.core` package: `Requirement`, `Candidate`, `Decision` and `Draft` as plain
  dataclasses with JSON round-trip. Every requirement line carries its own region, so one draft
  can span regions, and an optional availability zone.
- Ranking per ADR-0005: covers, then closest, then cheapest, then newest. Each candidate gets a
  short factual reason. Only the top candidate of an exact match is auto-confirmable.
- A draft store: one JSON file per draft under the user data directory, written atomically.
- Run records per ADR-0009: append-only JSONL per draft with the requirements, the candidates
  considered, each decision (`auto` or `human`, with its justification) and step timings.
- A `Provider` protocol (one method: requirement to priced candidates) and `HuaweiProvider`,
  which wraps the existing catalog, availability and pricing modules without changing them.
- `core.draft_quote()` ties these together: for each requirement it asks the provider, ranks,
  records, and auto-confirms only an exact top match. Anything else stays pending for a human.

### Out of scope

- The tool surface: `draft_quote`, `revise_quote`, `publish_quote`, CLI and MCP registry, and
  the `mcp-surface` rewrite. That's `workflow-surface` (roadmap #5).
- Publishing, saved lists, the page encoder and the gate. `share.py`, `services/`, `cli.py`
  and `server.py` are unchanged, so the publish path is exactly what it was.
- Draft totals and rating a whole draft. Candidates carry the catalog list price only;
  pricing a finished draft stays with the existing rating call and the gate.
- RI billing in the core (RI isn't in the catalog's price plans; it arrives with
  `spa-encoder`) and any provider other than Huawei.
- Closing the roadmap items "quotes that span several regions in one saved list" and
  "availability-zone handling". The model can carry both; saving them and pricing per AZ stay
  with the change that publishes.

### Publish-gate impact

None. The gate doesn't exist yet and nothing in `publish` reads the core. Run records hold
what the gate will later append, but this change adds no check.

## Capabilities

### New Capabilities

- `core/candidate-ranking`: ordering candidates for a requirement and deciding what may be
  auto-confirmed.
- `core/drafts`: the provider-neutral draft of a quote, its decisions, and its local storage.
- `core/run-records`: the append-only record that explains a quote after the fact.
- `huawei/candidates`: where Huawei candidates come from and when a request is refused.

### Modified Capabilities

None.

## Impact

- Code: new `src/autocalc/core/` and `src/autocalc/providers/huawei.py`. No existing module
  changes except an optional re-export. No new dependency (dataclasses, `decimal`, `json`).
- Tests: offline unit tests with a fake catalog; no `live` test is needed.
- Docs: new `docs/explanation/core.md` (how the pieces fit), `docs/roadmap.md` (the change's
  row stays; the live-catalog test row is addressed only if touched), `mkdocs.yml` nav.
- Paths: drafts and run records live under `auth.data_dir()` (`AUTOCALC_DATA` overrides), the
  same location rule as the rest of the tool, and work on Windows and Linux.
