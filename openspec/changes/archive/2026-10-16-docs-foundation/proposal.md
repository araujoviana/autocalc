# Proposal

## Why

The baseline specs (archived 2026-10-15) mirror today's ad-hoc code in six flat capabilities.
They mix requirements with vendor observations, such as cookie names, conversion-rate tables and "priced 0 in
every region tested". They also carry at least one wrong claim: the "Polite, sequential use"
rate limit quotes an LLM-API token limit as the calculator's. The grilling session settled the
product's direction: page-as-encoder, a fail-closed publish gate, USD list prices only, ranked
candidates with human confirmation, traceability, Windows and Linux, and AWS as the second
provider. None of that is written down where future changes can cite it. Every later phase
(quote-core, publish-gate, workflow-surface, spa-encoder, distribution) needs a provider-neutral
place for its requirements and an ADR to point at, so this foundation comes first.

## What Changes

- **Spec layout split into provider-neutral and per-provider capabilities.** The Huawei-specific
  baseline capabilities move under `huawei/`. Requirements are kept as they are; only these
  edits are made:
  - vendor observations are cut and moved to explanation docs;
  - capabilities that mixed two concerns are split (`saved-lists-and-auth` →
    `huawei/saved-lists` + `huawei/auth-sessions`);
  - the wrong rate-limit rationale is corrected.

  Behavior does not change. Code is untouched except for documentation cross-references.
- The five flat baseline capabilities (`catalog-access`, `rating`, `card-building`,
  `region-availability`, `saved-lists-and-auth`) are **retired**: every requirement is removed
  and re-added under the new path. `mcp-surface` keeps its path, because it is already
  provider-neutral; the `workflow-surface` change rewrites it later.
- **Architecture Decision Records** (MADR 4) in `docs/adr/`, recording each grilling decision with its
  evidence. ADR-0001 is "page as encoder".
- **Diátaxis documentation site.** `docs/{tutorials,how-to,reference,explanation}`, built
  with MkDocs Material and `mkdocs build --strict` in CI. `docs/CAVEATS.md` is split into
  generic `explanation/huawei/*` pages that contain no client data.
- **`docs/BACKLOG.md` retired.** Each item is mapped to a planned change, an ADR or an
  explanation page, or is dropped with a reason. The file is then deleted.
- **`openspec/config.yaml` gains `context:` and `rules:`.** These encode the standing
  constraints: USD only, no client data in the repo, Windows and Linux, every proposal states
  what is out of scope and how the publish gate is affected, and a spec delta lands in the same
  change as the code that makes it true.

Out of scope:
- Any behavior change, including the auth rework, bounded-concurrency rating, USD-only removal
  of `convert_currency` and the Windows CI matrix. Each lands with its implementing change,
  and the ADRs written here record the decisions.
- Writing target requirements for capabilities not yet built (`quote-model`,
  `candidate-selection`, `publish-and-verify`, `traceability`).
- Creating GitHub issues. Backlog items that stay open are listed for the user to file.

Publish-gate impact: none (no runtime change).

## Capabilities

### New Capabilities
- `huawei/catalog`: Anonymous, cached, mirror-backed reads of the Huawei calculator catalog, plus SKU search and label resolution.
- `huawei/rating`: Pricing items with the Huawei rating engine: billing-mode mapping, duration scaling, comparisons, retries and typed errors.
- `huawei/card-encoding`: Producing saved-list cards that Huawei's website renders and edits at the stored price.
- `huawei/region-availability`: Friendly region names and pre-build checks for service, mode and spec availability in a Huawei region.
- `huawei/saved-lists`: Creating, reading, renaming, duplicating, deleting and validating saved lists and their share links.
- `huawei/auth-sessions`: Signing in to a Huawei account once and keeping that session usable and protected.

### Modified Capabilities
- `catalog-access`: retired, with all requirements moved to `huawei/catalog`.
- `rating`: retired, with all requirements moved to `huawei/rating`. The rate-limit rationale is corrected there.
- `card-building`: retired, with all requirements moved to `huawei/card-encoding`. Measurement notes go to explanation docs.
- `region-availability`: retired, with all requirements moved to `huawei/region-availability`.
- `saved-lists-and-auth`: retired, split into `huawei/saved-lists` and `huawei/auth-sessions`.

## Impact

- `openspec/specs/`: new `huawei/*` tree. The five retired directories are deleted after
  archive, since archiving would leave them empty.
- `docs/`: new `adr/`, Diátaxis tree, `mkdocs.yml`. `CAVEATS.md` and `BACKLOG.md` are removed.
  `README.md` links the docs site.
- `pyproject.toml`: a new `docs` dependency group (`mkdocs-material`).
  `.github/workflows/ci.yml`: a docs build step.
- `openspec/config.yaml`: `context` and `rules`.
- Source code: none, apart from comments or docstrings that cite spec paths, if any are found.
