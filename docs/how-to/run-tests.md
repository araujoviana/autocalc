# Run the tests

## The CI gate

These commands mirror `.github/workflows/ci.yml`. Run them before pushing:

```bash
uv sync --group dev           # install, including ruff and pytest
uv run ruff check             # lint
uv run pytest -m "not live"   # offline tests: no network, session or corpus needed
uv run --group docs mkdocs build --strict   # this documentation site
```

## Live checks (by hand)

```bash
uv run pytest -m live                    # read-only checks against the real calculator
uv run python -m tests.support.render    # publish a list, open it headless, then delete it
```

- `-m live` needs network access. The golden tests also need the local corpus
  ([Refresh the golden corpus](refresh-corpus.md)) and skip without it.
- `tests.support.render` **creates and deletes a list in your account**. It needs
  `autocalc login`.
