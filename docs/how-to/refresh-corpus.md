# Refresh the golden corpus

The golden tests rebuild real saved lists from their options and compare them field by field.
Those lists come from **your own account** and are client data, so they live only in the
gitignored `tests/fixtures/corpus/` and never leave your machine.

```bash
uv run autocalc login                          # once, if not logged in
uv run python -m tests.support.pull_corpus
```

The script:
- lists your saved lists;
- downloads each one through the anonymous read endpoint;
- writes `<id>.json` files plus an `index.json`.

It is read-only: nothing in the account is created, changed or deleted. It exits non-zero if
any list failed to download.

Golden-test misses after a refresh are usually [catalog drift](../explanation/huawei/catalog-drift.md).
