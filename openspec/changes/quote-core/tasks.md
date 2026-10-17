# Tasks

## 1. Model and ranking

- [ ] 1.1 Add `src/autocalc/core/model.py` (`Requirement`, `Candidate`, `Decision`, `Draft`) with `to_dict`/`from_dict`, `Decimal` prices stored as strings, and a draft `version` field (design D1, D2). Verify with `uv run pytest tests/test_core_model.py`: a draft with two regions, an AZ and decisions survives `from_dict(to_dict(x)) == x`, and a `Decision` without a justification or for an unknown requirement raises `ValidationError`
- [ ] 1.2 Add `src/autocalc/core/ranking.py` with `rank(req, candidates) -> list[Ranked]` and `auto_confirmable(ranked)` (design D3, D4). Verify with `uv run pytest tests/test_core_ranking.py` covering each scenario of `core/candidate-ranking`: covering beats cheaper, price then generation tie-breaks, non-covering last, exact vs size-up vs missing named spec, and reason strings for "cheapest of 3 exact matches" and a size-up

## 2. Storage

- [ ] 2.1 Add `src/autocalc/core/store.py` with `DraftStore` (save atomically, load, list newest first) (design D5). Verify with `uv run pytest tests/test_core_store.py`: round trip, unknown id error naming the id, listing order, no `.tmp` file left after a save, and files land under `AUTOCALC_DATA`
- [ ] 2.2 Add `src/autocalc/core/runs.py` with `RunRecord.append/step/read` (design D6). Verify with `uv run pytest tests/test_core_runs.py`: appended events keep earlier lines byte-identical, a step that raises still records its `ms`, and both a UTC timestamp and a kind are on every line

## 3. Provider and workflow functions

- [ ] 3.1 Add `src/autocalc/core/provider.py` (the `Provider` protocol) and `src/autocalc/core/draft.py` with `draft_quote` and `decide` (design D7, D9). Verify with `uv run pytest tests/test_core_draft.py` using a fake provider: an exact requirement gets an `auto` decision whose justification equals the candidate's reason, an inexact one stays pending, `decide` records a `human` decision and clears pending, the run record holds requirements, ranked candidates and decisions, and a two-region draft works
- [ ] 3.2 Add `src/autocalc/providers/huawei.py` with `HuaweiProvider` (design D8). Verify with `uv run pytest tests/test_core_huawei.py` using a fake `Calculator`/`Availability`: SKUs without a price for the mode are dropped, vCPUs/memory/generation/price are filled, a service not sold in the region raises `SERVICE_NOT_SOLD` with regions in details, and RI raises `VALIDATION` naming `billing` before any catalog call

## 4. Docs and verification

- [ ] 4.1 Add `docs/explanation/core.md` (how requirement, candidates, decision, draft and record fit; where files live) and its `mkdocs.yml` nav entry. Verify with `uv run --group docs mkdocs build --strict`
- [ ] 4.2 Run `uv run ruff check`, `uv run pytest -m "not live"`, `uv run --group docs mkdocs build --strict` and `openspec validate quote-core --strict`; all pass. Confirm `git diff main -- src/autocalc/share.py src/autocalc/services src/autocalc/cli.py src/autocalc/server.py` is empty (the publish path is untouched)

## Workflow follow-up

- Archive with `/opsx:archive quote-core`.
- Next change: `publish-gate`.
