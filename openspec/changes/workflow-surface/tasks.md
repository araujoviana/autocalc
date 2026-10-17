# Tasks

## 1. Registry

- [x] 1.1 Add `src/autocalc/tools.py` (`tool`, `REGISTRY`), move the existing tool functions out of `server.py` into it (minus `create_price_list`), and register from it in `server.py`. Verify with an offline test that the registered MCP tool names equal the registry's
- [x] 1.2 Generate CLI subcommands from the registry in `cli.py` (design D2). Verify with offline tests: scalar, bool and JSON parameters parse, `@file` works, the result prints as JSON, a hand-written command name is not overridden

## 2. Workflow

- [x] 2.1 Add `options` to `Requirement` and `src/autocalc/workflow.py` with `draft_quote`, `revise_quote`, `publish_quote` (design D3). Verify with offline tests using a fake provider and fake gate: pending requirement blocks publish with its ids; decided ECS/EVS requirements reach the builder with the decided spec and options; an unsupported service fails before any build
- [x] 2.2 Rewrite the `quote_workflow` prompt and drop `create_price_list` (and its tests). Verify with `uv run pytest -m "not live"`

## 3. Docs and verification

- [x] 3.1 Update docs that name `create_price_list` and `docs/roadmap.md` (keep the `MCPServer` row, with the reason). Verify with `mkdocs build --strict`
- [x] 3.2 Run `uv run ruff check`, `uv run pytest -m "not live"`, `uv run --group docs mkdocs build --strict` and `openspec validate workflow-surface --strict`; all pass

## Workflow follow-up

- Archive with `/opsx:archive workflow-surface`.
- Next change: `spa-encoder`.
