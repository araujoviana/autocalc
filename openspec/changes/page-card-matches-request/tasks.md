# Tasks

## 1. Encoder

- [ ] 1.1 In `encode_card`, after capture, compare `selectedProduct.region` and `chargeMode` with the request's `global_REGIONINFO` (skip region when none is requested); on a mismatch raise `PageEncodeFailed` with `step="region"` or `step="chargeMode"`
- [ ] 1.2 Re-run the whole fill-and-capture up to three tries in all on that mismatch, and only on it
- [ ] 1.3 Check on a live on-demand card and a monthly card that the charge-mode comparison holds (no false mismatch)

## 2. Sweep

- [ ] 2.1 Add `region` and `chargeMode` to the steps `tests/support/region_sweep.py` treats as retryable, or drop its own retry for them if the encoder now handles it

## 3. Tests and checks

- [ ] 3.1 Offline tests in `tests/test_page_replay.py`: wrong region then right region returns the card; three wrong regions raise naming the region; a regionless service is not compared
- [ ] 3.2 Run `uv run ruff check`, `uv run pytest -m "not live"` and `uv run --group docs mkdocs build --strict`; repeat the sweep and confirm `redis`/`hecs` in `la-south-2` no longer change price between runs
