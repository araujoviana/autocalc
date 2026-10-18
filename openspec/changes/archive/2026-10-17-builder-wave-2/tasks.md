## 1. Recipe route

- [x] 1.1 `services/forms.py`: `Recipe`, `RECIPES`, `FormBuilder`; unknown option → `VALIDATION`. Verify: unit tests for build output and for the refusal.
- [x] 1.2 `autocalc page-controls <service>` (`page/controls.py` + CLI row in `docs/reference/cli.md`). Verify: offline test with a fake page; live run on redis lists `calculator_redis_version_edition`.

## 2. Recipes, live

- [x] 2.1 Write recipes from `page-controls` for gaussdb, rdsformariadb, taurusdb, hrds, redis, memcached, dds. Verify: `SPA_ONLY=... uv run python -u -m tests.support.spa_matrix` shows stored = Edit = rating for every mode.
- [x] 2.2 Same for ddm, drs, sfs, dss, sdrs, des.
- [x] 2.3 A service that cannot pass moves to *later* in `docs/explanation/v1-scope.md` with its reason. Verify: the doc builds and its counts match.

## 3. Wire and close

- [x] 3.1 Add the passing services to `VERIFIED` (version 11.4.201); extend `tests/test_registry.py`. Verify: `uv run pytest -q --ignore=tests/test_live.py -k "not live"`.
- [x] 3.2 Docs: ADR-0001 result table, `cli.md` verified list, roadmap. Verify: `mkdocs build --strict`.
- [x] 3.3 `ruff`, `openspec validate --specs --strict`, sync delta into main specs, archive, commit locally.
