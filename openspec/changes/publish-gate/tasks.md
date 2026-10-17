# Tasks

## 1. Gate

- [x] 1.1 Add `GateFailed` (`GATE_FAILED`, details `cards`, optional `list_id`) to `src/autocalc/errors.py` and document it in `docs/reference/errors.md`. Verify with `uv run pytest tests/test_gate.py -k error` and the strict docs build
- [x] 1.2 Add `src/autocalc/gate.py`: `rerate`, `CardCheck`, `verify`, `publish_checked` (design D1 to D6), moving `rerate` out of `tests/support/page_rating.py` and updating its importers. Verify with `uv run pytest tests/test_gate.py` using fakes: all agree returns the link; a rated mismatch, an Edit mismatch, an Edit result that could not run, and a validation issue each delete the list and raise with that card's amounts; an exception in `verify` deletes the list; a failing delete puts the list id in the message; `AUTOCALC_KEEP_ON_FAIL=1` keeps the list and names it

## 2. Wiring and the EVS/Direct Connect fix

- [x] 2.1 Make `server.create_price_list` (non-dry-run) and `share.publish` call `gate.publish_checked`. Verify with an offline test that the tool returns the link only through the gate (fake gate raising `GateFailed` propagates, and `Session.create` is never the last step)
- [x] 2.2 Add `quantity_tokens` to `Builder.assemble`; pass `("calc_5_", "calc_6_")` from `evs.py` and `dline.py`. Verify with `uv run pytest tests/test_builders_golden.py -k "evs or dline"` and an offline assertion that the EVS card's `purchaseNum` and `global_QUANTITY` carry the tokens

## 3. Live check

- [x] 3.1 Run the gate live on your account (logged in): publish a list with an ECS, an EVS and an ELB card, with settlement `total` and again with `monthly`, then delete both. Verify that both links are returned with equal stored, rated and Edit amounts, and `autocalc lists` shows no `[autocalc-selftest]` list afterwards. Record the result in `docs/explanation/huawei/publish-gate.md`. If the monthly settlement fails, keep the roadmap row and note why **Outcome (2026-10-17):** both settlements passed (69.22, 18.00, 21.00 per card, equal across the three checks); no test list remained.

## 4. Docs and verification

- [x] 4.1 Add `docs/explanation/huawei/publish-gate.md` and its nav entry; remove the settlement row from `docs/roadmap.md` if 3.1 passed. Verify with the strict docs build
- [x] 4.2 Run `uv run ruff check`, `uv run pytest -m "not live"`, `uv run --group docs mkdocs build --strict` and `openspec validate publish-gate --strict`; all pass

## Workflow follow-up

- Archive with `/opsx:archive publish-gate`.
- Next change: `workflow-surface`.
