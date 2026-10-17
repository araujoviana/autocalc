# Tasks

The time box (design D10) starts with 1.1: three working days to a go/no-go.

## 1. Page walkthrough

- [x] 1.1 Drive the ECS form headed in `sa-brazil-1` (Playwright or the RE tooling), anonymously, and record in a new `docs/explanation/huawei/page-encoder.md`: the frontend version; the selectors for the region, billing-mode and RI term/payment controls; how each ECS component kind (radio, select, stepper, switch, addible) takes a value; where the form state and the price-board amount live in the Pinia stores; and how a shared list's Edit view opens anonymously. Keep it generic, with no list ids or account data. Add the page to the `mkdocs.yml` nav. Verify: `uv run --group docs mkdocs build --strict` passes, and the doc answers every item of design "Open Questions"

## 2. Browser context and error

- [x] 2.1 Add `PageEncodeFailed` (`PAGE_ENCODE_FAILED`, details `service`, `step`/`field`, `frontend_version`, hint naming `AUTOCALC_PAGE_HEADED=1`) to `src/autocalc/errors.py` and document it in `docs/reference/errors.md`. Verify with an offline test that the code, details and hint are set, plus a strict docs build
- [x] 2.2 Add `src/autocalc/page/browser.py`: a context manager that launches `find_browser()` non-persistent (headed when `AUTOCALC_PAGE_HEADED=1`) and yields a fresh context, closing both (design D2). Verify with offline tests that use a fake Playwright: `profile_dir()` is never created or opened, each call gets a new context, and a launch exception becomes `PAGE_ENCODE_FAILED` (step `browser`) without the raw message in `str(exc)`

## 3. Driver

- [x] 3.1 Add `src/autocalc/page/store.py`: JS snippets that read the form state, the price-board amount, the inquiry status and `cartInfo.cartListDataBase` as plain JSON, plus Python normalizers. Add a sanitized, synthetic store snapshot under `tests/fixtures/page/`. Verify with offline tests that the normalizers extract card, amount and status from the snapshot, and `grep` the fixture for list ids or account names → none
- [x] 3.2 Add `src/autocalc/page/driver.py` with `Step(component_id, kind, value)` and one action per kind, each followed by a read-back check (design D3, D4). Verify with offline tests using a fake page: a read-back mismatch and a missing option each raise `PAGE_ENCODE_FAILED` naming the component id
- [x] 3.3 Add capture to the driver: wait for a settled price, map a failed inquiry to step `inquiry`, remove the guide overlay, click Add to List, return the new cart item as plain data, with a deadline on every wait (design D5). Verify with offline fake-page tests for success, a failed inquiry (step `inquiry`) and a cart that never grows (step `add_to_list`). Update the explanation doc's "How a card is captured" section and verify the strict docs build

## 4. ECS recipe and encoder

- [x] 4.1 Add `src/autocalc/page/ecs.py`: ECS options (same names as `EcsBuilder.build`) → steps, for on-demand, monthly and RI and for 0, 1 and 2 data disks, with and without bandwidth. Verify with offline tests on the produced step lists, including two distinct addible data-disk steps
- [x] 4.2 Expose `encode_ecs(**options) -> card` that combines browser, recipe and capture. Add `live` tests (anonymous, no credentials): a monthly card's `selectedProduct.amount` equals the rating engine's price for its products, and two different cards encoded concurrently in threads each match their own flavor. Verify with `uv run pytest -m live -k page`

## 5. Edit-price check

- [x] 5.1 Add `src/autocalc/page/edit_check.py`: `edit_check(list_id) -> list[EditResult]`, with stored amounts from `share_detail`, the Edit amount from the store in a fresh context, cent-exact `Decimal` comparison, and per-card failures reported, not raised (design D6). Verify with offline tests for cent rounding, and that a card whose Edit view times out is `equal=False` with a reason. Update the explanation doc's "Edit check" section and verify the strict docs build

## 6. Proof harness

- [x] 6.1 Add `tests/support/spa_poc.py` per design D7: three concurrent encodes, builder diff, save as `autocalc-poc-<timestamp>`, re-read, rating plus Edit per card, table with frontend version, delete in `finally`, exit 0 only if all equal. Verify by running `uv run python -m tests.support.spa_poc` (logged in) and checking afterwards with `autocalc lists` that no `autocalc-poc-` list remains
- [x] 6.2 Add a `--negative` flag to the harness that also saves the monthly Python-builder card with its addible data-disk render entries removed, and expects `edit_check` to report it as not equal. This proves the check can fail. Verify by running the harness with `--negative`: that card is reported unequal, the run's exit code reflects only the real matrix, and no list remains

## 7. Outcome

- [x] 7.1 Record the outcome in ADR-0001 "More Information": run date, frontend version, the per-card table from 6.1, the builder diff summary, and go / no-go / partial per billing mode (design D10). If the outcome changes the plan, update the `spa-encoder` row in `docs/roadmap.md`. Verify the strict docs build, and that the ADR states a result for each of on-demand, monthly and RI
- [x] 7.2 Only on no-go or partial: remove the "Page-encoded ECS cards are Edit-faithful" requirement from this change's spec delta, or narrow it to the billing modes that passed. Verify with `openspec validate spa-encoder-poc --strict`, and that every remaining requirement is covered by a passing test or the harness run **Outcome:** not applicable. All three modes passed (go, see ADR-0001), so the spec delta stays whole.

## 8. Verification

- [x] 8.1 Run `uv run ruff check`, `uv run pytest -m "not live"`, `uv run pytest -m live -k page`, `uv run --group docs mkdocs build --strict` and `openspec validate spa-encoder-poc --strict`; all pass. Confirm `git diff main -- src/autocalc/share.py src/autocalc/services src/autocalc/cli.py src/autocalc/server.py` shows no change from this change (the publish path is untouched) **Outcome (2026-10-17):** all pass (110 offline, 2 live page tests). The branch was cut from the unmerged `auth-sessions`, so the publish-path diff ran against the branch point `932e9cc`, not `main`: no changes.

## Workflow follow-up

- Archive with `/opsx:archive spa-encoder-poc`.
- Next change: `quote-core`.
