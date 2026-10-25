# Contributing

Thanks for looking. autocalc is a small, experimental project, so keep changes focused.

## Before you start

- **Open items live in [`docs/roadmap.md`](docs/roadmap.md)**, not in an issue tracker. To suggest
  something, open a pull request, or reach out to the maintainer, rather than filing an issue.
- **Behavior is specified in [`openspec/specs/`](openspec/specs/)**, and changes go through OpenSpec
  (`/opsx:propose`, `/opsx:apply`, `/opsx:archive`). A change that alters behavior should carry its
  spec delta. The per-tool command files are not committed: run `openspec update` to generate them
  for your own tool. Design decisions are recorded in [`docs/adr/`](docs/adr/index.md).
- **Windows and Linux both have to work** ([ADR-0012](docs/adr/0012-windows-and-linux.md)). Avoid
  hard-coded paths and POSIX-only shell calls.

## Set up and check

```bash
uv sync --group dev --group docs
uv run ruff check
uv run pytest -m "not live"
uv run --group docs mkdocs build --strict
```

These are the checks CI runs. [Run the tests](docs/how-to/run-tests.md) also covers the live checks,
which need network access (and, for `tests.support.render`, a login that creates and deletes a list
in your account).

## Pull requests

- Keep each PR to one change, with tests for new logic.
- Update the docs and the spec when behavior changes.
- **Never commit client data, sessions, cookies or the golden corpus** (all gitignored). A pull
  request that includes any of them will be closed.
- Publishing is fail-closed ([ADR-0003](docs/adr/0003-fail-closed-publish-gate.md)): don't loosen
  a check to make a test pass.

## License

By contributing you agree your work is licensed under [Apache-2.0](LICENSE).
