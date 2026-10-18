# Tasks

## 1. Scope

- [x] 1.1 Define the quotable list from the live catalog (`autocalc services` plus each service's form) in `docs/explanation/v1-scope.md`: every service, counted or not, with the reason. Add it to the nav. Verify: the strict docs build, and the page states the v1 target as a number

## 2. Registry

- [x] 2.1 Add `spec_arg` to `Builder` (`None` for usage-priced services), set it on the 13 builders and the 4 existing ones, and make `workflow.publish_quote` read it instead of `_SPEC_ARG`. Add the verified list (service → frontend version) as data next to the builders. Verify with offline tests: a builder with no `spec_arg` publishes from options; an unverified service is refused with the verified list named

## 3. Replay

- [x] 3.1 For each of the 13, replay its builder card on the live page with `tests/support/spa_matrix.py` and list the control kinds that fail. Extend `page/driver.py` per kind (offline test with a fake page each). Verify: `uv run pytest -m "not live" tests/test_page_replay.py tests/test_page.py`; a failing kind is still named in the error

## 4. Live matrix

- [x] 4.1 Add the 13 services, each billing mode they sell, to the matrix; run it (background and wait; list deleted in `finally`). Verify: every row has stored = Edit = rating, or the service/mode is excluded with a documented reason in `docs/explanation/huawei/page-encoder.md`
- [x] 4.2 Write each passing service and the frontend version into the verified list. Verify: an offline test that every verified service has a builder and a version

## 5. Frontend-version warning

- [x] 5.1 `doctor` and `publish_quote` compare the live frontend version with each service's verified version and warn on a difference; page errors carry the live version. Verify with offline tests for same, different and unknown versions

## 6. Docs and close

- [x] 6.1 Update `docs/reference/cli.md`, `docs/roadmap.md` (drop the closed row, set wave 2) and ADR-0001 (wave 1 result table). Verify: strict docs build
- [x] 6.2 Run `uv run ruff check`, `uv run pytest -m "not live"`, `uv run pytest -m live -k page`, `openspec validate builder-wave-1 --strict`. Sync specs by hand, archive, commit
