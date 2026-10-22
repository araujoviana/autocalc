## 1. Recipes, live

- [x] 1.1 Recipes for er, ga, esw, vpcep, eip, vpn, cc. Verify: `SPA_ONLY=... uv run python -u -m tests.support.spa_matrix` shows stored = Edit = rating, non-zero, for every mode.
- [x] 1.2 Recipes for cfw, hss, aad, dbss, cbh, dsc, ssa, ccm, edgesec. Same verification.
- [x] 1.3 Recipes for reliability, ucs, hecs, hcss. Same verification.
- [x] 1.4 Any service that cannot pass moves to *later* in `docs/explanation/v1-scope.md` with its reason. Verify: counts in the table match the rows.

## 2. Wire and close

- [x] 2.1 Add passing services to `VERIFIED` (frontend 11.4.201) and WAVE3 to the matrix; extend `tests/test_registry.py`. Verify: `uv run pytest -q --ignore=tests/test_live.py -k "not live"`.
- [x] 2.2 Docs: ADR-0001 result table, `cli.md` verified list, roadmap. Verify: `uv run --group docs mkdocs build --strict`.
- [x] 2.3 `ruff`, `openspec validate --specs --strict`, sync delta, archive, commit locally.
