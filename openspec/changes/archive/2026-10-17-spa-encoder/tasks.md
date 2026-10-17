# Tasks

## 1. Replay

- [x] 1.1 Add `src/autocalc/page/replay.py` (`card_steps`, `form_values`, `global_values`, `same_value`, `encode_card`) and the driver changes in design D1-D4 (`auto` kind, `base-radio-stepper`, `common-input`, blur, hidden-control skip, form-state read-back for steppers). Verify with offline fake-page tests: flattening of a nested/addible/measure state into steps (one add per row), a hidden control skipped only when held, a stepper the form rejects fails naming the control, and `encode_card` raises step `form` when the card lacks a requested value
- [x] 1.2 Update `docs/explanation/huawei/page-encoder.md` (replay, the new control kinds, the SFS capacity rule, hidden controls). Verify with `uv run --group docs mkdocs build --strict`

## 2. Workflow

- [x] 2.1 In `workflow.py`, encode each built card with `encode_card` (parallel, at most 3 at a time) before `publish_checked`, via a module function tests replace; add `rds` (`flavor`) and `sfsturbo` (`tier`) to `_SPEC_ARG`. Verify with offline tests: the page's card, not the builder's, reaches the gate; an encode failure saves nothing; RDS reaches the builder with its spec and options

## 3. Proof

- [x] 3.1 Add `tests/support/spa_matrix.py`: one card per service and billing mode (from the corpus options), encode, save as `autocalc-poc-<timestamp>`, re-read, rating plus Edit per card, table, delete in `finally`, exit 0 only if all equal. Verify by running it logged in and checking `autocalc lists` shows no `autocalc-poc-` list afterwards
- [x] 3.2 Add live tests (`-m live -k page`) for one encode per service comparing the page's amount with the rating engine. Verify with `uv run pytest -m live -k page`
- [x] 3.3 Record the result in ADR-0001 "More Information" (date, frontend version, per-service table) and update `docs/roadmap.md` (`spa-encoder` done; `publish_quote` row now lists CCE, ELB and OBS). Verify with the strict docs build

## 4. Verification

- [x] 4.1 Run `uv run ruff check`, `uv run pytest -m "not live"`, `uv run --group docs mkdocs build --strict` and `openspec validate spa-encoder --strict`; all pass

## Workflow follow-up

- Archive with `/opsx:archive spa-encoder`.
- Next change: `distribution`.
