# Tasks

## 1. Behaviour

- [ ] 1.1 In `Calculator.inquiry`, retry HTTP 429 with the same delay as 5xx (both the JSON and non-JSON branches)
- [ ] 1.2 Add an offline test: a 429 answer followed by a 200 returns the price; three 429s raise `UpstreamError`

## 2. Docs

- [ ] 2.1 Remove "The current spec still requires sequential use" from `docs/explanation/huawei/concurrency.md`
- [ ] 2.2 Run `uv run ruff check`, `uv run pytest -m "not live"` and `uv run --group docs mkdocs build --strict`
