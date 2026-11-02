## Context

Observed in the current tree:

- `services/forms.py` holds 30 `Recipe`s: `{option name → control id}` dicts written by hand,
  one per recipe service. The 22 builders declare options through `Builder.options()` (the
  signature of `build()`).
- `autocalc page-controls <service>` lists a page's visible controls (id, kind, option values)
  anonymously. The spec `huawei/page-encoding` › "A page's controls can be listed" requires it.
- Controls are addressed by config id; each carries `sourceData` options and the form is
  ordered (each ECS choice narrows the next). Region-specific values and hard-coded region
  checks in inline JS are documented in `docs/explanation/huawei/page-encoder.md`.
- `draft_quote` takes free-form `options`. Names are checked (`mcp-surface` › "Builder options
  are discoverable"), values are not, and the legal values are not discoverable over MCP.
- `share/update` exists in `share.py`. `rename_price_list` uses it with the same list id, so an
  update keeps the id for a rename. Whether it keeps the id when the **cards** change is not
  established in the repo.

See proposal.md for motivation.

## Goals / Non-Goals

**Goals**
- One schema per service, generated from the page, committed, and consumed by validation,
  coverage, drift and MCP.
- A quote file a human or agent can write and review, with a Terraform-like plan/apply loop.
- Format readable by both Python and TypeScript.

**Non-Goals**
- Replacing the workflow tools or builders. `plan`/`apply` reuse the same engine (ranking,
  drafts, gate).
- Generating the schema for every service in one step: start with ECS and the recipe services,
  expand as coverage reports show gaps.
- Cross-card references and expressions.

## Decisions

**D1. Generated structure, hand-written naming.** The schema is regenerated from the page; only
`option` names, `notes` and `unsupported` markers are written by hand, in a separate section
the generator preserves. Alternative: all hand-written (status quo, drifts silently) or all
generated (option names would be raw control ids, unusable for agents).

**D2. Structure, not values, is committed for catalog-dependent controls.** A control whose
values depend on region or earlier choices records its dependencies and `values: catalog`;
values are resolved at validate/plan time from the catalog (fast, anonymous). Alternative:
crawl every combination, rejected as slow and brittle.

**D2b. Dependencies come from form order first, observation later.** The page's `viewConfig`
states no inter-control dependencies (probed on ECS). The generator records `after` from form
order with `source: order`; a later task may add `source: observed` edges by changing an earlier
choice and diffing later options. Consumers treat both alike, so adding observed edges changes
no consumer. Alternative: observe now, rejected as a per-service crawl outside this change.

**D3. The format is YAML with a JSON Schema for the schema files themselves.** YAML for review
and diffs; a JSON Schema validates the schema files so both languages can check them. Lock
files and quote files are YAML too. Alternative: JSON everywhere, rejected as hard to review;
HCL, rejected (no mature parser in both languages and no need for expressions).

**D4. `plan` and `apply` layer on the existing engine.** `plan` = validate + the existing ranking
and rating + lock comparison, producing the same draft structure. `apply` = the existing
`publish_quote` path. This keeps ADR-0003/0005/0007 intact and avoids a second publish path.
Alternative: a new publish path, rejected because it would need its own gate and verification.

**D5. Validation is offline.** It reads only schema files, plus the catalog cache for
`values: catalog` controls; it never starts a browser. A schema that validates a request is
necessary but not sufficient: the Edit check still decides (ADR-0016 request fidelity).

**D6. Lock file pins the resolved spec, not the price.** Pinning the spec keeps the quote
stable; a price change is reported in `plan` as drift. Alternative: pin prices, rejected because
the rating engine is the source of truth for prices and a stale pin would hide a change.

**D7. Resources and tools are generated from the same files.** MCP schema resources serve the
committed YAML, so the agent reads exactly what validation uses. Error messages are produced by
the validator, so the legal values in an error cannot disagree with the schema.

## Risks / Trade-offs

- **Generated schema captures a page state that hides controls** (conditionally visible
  controls) → the generator walks the form order and records `visible_when` where it can
  observe it; what it cannot observe is listed as unmapped in coverage rather than missing.
- **Frontend redesign breaks generation** → drift detection reports it, and committed schemas
  keep validation working until regenerated; apply still goes through the Edit check.
- **Two sources of truth during migration** (schema vs `Recipe`/builders) → recipes are derived
  from or checked against the schema; a test fails when they disagree.
- **Schema consumers disagree between Python and TypeScript** → a shared set of synthetic
  fixtures (schema + quote → expected plan) runs in both.

## Migration Plan

1. Land the generator and ECS schema, validate against existing ECS builder options.
2. Extend to the recipe services, then builder services, driven by the coverage report.
3. Land quote files, plan and apply, then the MCP resources and errors.
4. Rebase `ts-parity` on the schema and the shared fixtures.
5. Rollback: the feature is additive; the workflow tools are unchanged.

## Open Questions

- **State and update-in-place.** Terraform keeps state so a re-apply updates the same
  resource. Here the analog is the saved list. The spike (tasks group 6) tests whether
  `share/update` with changed cards keeps the same list id and share link. The answer decides
  whether re-apply updates or recreates. Local versus shared state is deliberately not decided
  here and would be its own ADR after the spike. Until then `apply` creates a new list and
  records its id beside the quote file.
- File naming and location of user quote files (config directory or the working directory).
  Cosmetic; settle when implementing task 4.1.
