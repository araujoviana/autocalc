# Tasks

## 1. Baseline

- [x] 1.1 Create branch `ts-parity` from `main` and merge `origin/bun-migration-review` into it. Verify: `cd experimental/bun && bun install --frozen-lockfile && bun run check && bun run test:offline` passes.
- [x] 1.2 Add `scripts/parity-registry.*` that dumps tool names and input schemas from Python (`src/autocalc/tools.py` + `workflow.py`) and from `experimental/bun/src/core/registry.ts`, and diffs them. Verify: it reports exactly the known gaps (six workflow tools, `export_quotes_xlsx`, TS-only `create_price_list`) and exits non-zero.
- [x] 1.3 Add a parity test-map listing each `tests/test_*.py` file and its TypeScript counterpart or "missing". Verify: running it prints one row per Python test file with no unknown entries.

## 2. Core (ADR-0005, 0006, 0009, 0010, 0015)

- [x] 2.1 Port the core model, `Provider` interface and ranking (`core/model.py`, `provider.py`, `ranking.py`) and `HuaweiProvider`. Verify: ported `test_core_model`, `test_core_ranking`, `test_core_huawei` pass in `bun test`.
- [x] 2.2 Port the draft store and run records using the same on-disk JSON as Python (D4). Verify: ported `test_core_store`, `test_core_runs`, `test_core_draft` pass, and a draft written by Python opens in TypeScript and the reverse (round-trip test).

## 3. Workflow tools (ADR-0007)

- [x] 3.1 Port `draft_quote`, `revise_quote`, `list_drafts`, `inspect_draft`, `recover_draft` (`workflow.py`, `core/draft.py`). Verify: ported `test_workflow` passes; the registry diff (1.2) no longer lists them. Note: the unknown-option check of `draft_quote` moves to 4.3b (schema validator).
- [x] 3.2 Match MCP output shaping and the token budget (ADR-0008). Verify: ported output-format scenarios from `openspec/specs/mcp-surface/` pass.

## 4. Page encoder, gate and publish (ADR-0001, 0003, 0016)

- [x] 4.1 Port the page layer: browser context, form driver, controls, page store, replay and the ECS options (`page/*.py`) to the form-only path (D3). Controls are replayed from the schema's option names where the schema maps them, not from per-service builders. Verify: ported `test_page`, `test_page_replay`, `test_forms`, `test_ecs_defaults` pass offline against `tests/fixtures/page`. Note: schema-driven option replay lands with 4.3b; `page/ecs.py` is intentionally not ported.
- [x] 4.2 Port `gate.py` (save, Edit check, delete on mismatch) and `share.py` write path. Verify: ported `test_gate`, `test_share_session` pass; a forced mismatch deletes the saved list and returns no link. Note: the write path (`share.py`) already lived in `core/lists.ts`; the three-valued verdict, retries and known-defect table from `docs/research/edit-verification.md` belong to the separate robustness change, not to parity.
- [x] 4.3 Add `publish_quote` with request-fidelity refusals; remove `create_price_list`. Verify: ported `test_workflow` publish scenarios pass; registry diff shows only TS-only tools gone. Note: the TS-only `create`/`update` CLI commands, `updatePriceList` and `publishLegacyEcs` went with it (all were ungated writers); recipe services publish with 4.3b.
- [ ] 4.3b (done: schema format and loader, quote file parser/validator, `plan_quote`, `apply_quote`, lock file with `needs`-bound pins, `draft_quote` option check; open: schema-driven option replay, recipe services, schema parity tests over `tests/fixtures/schema/`) Port the declarative layer from `card-schema`: read the committed `src/autocalc/schema/files/*.yaml` unchanged (they move with the tree at cutover), the quote file parser and validator, `plan_quote`, `apply_quote`, the lock file and the schema MCP resources. Verify: the TypeScript tests read `tests/fixtures/schema/` and `tests/fixtures/quotes/` (shared, not copied) and give the same validation errors, plans and lock files as `tests/test_schema.py` and `tests/test_quote_file.py`.
- [ ] 4.3c Port the schema generator (`schema pull|coverage|diff`) on Playwright for TypeScript. Verify: pulling `ecs` produces a file whose `schema diff` against the committed Python-generated file is empty.
- [ ] 4.4 Verify the 50 services on the page in the four regions (`sa-brazil-1`, `la-south-2`, `ap-southeast-1`, `ap-southeast-3`). Verify: TS region sweep outcomes equal Python's per combination (`tests/support/region_sweep` equivalent); any difference is explained or fixed.

## 5. Remaining tools and surface

- [ ] 5.1 Port `export_quotes_xlsx` with identical sheet layout; settle the zip-writer open question first. Verify: the xlsx scenarios from `test_audit_contracts` and `test_workflow` pass in TypeScript and the produced file opens in a spreadsheet application.
- [ ] 5.2 Port `update`, the daily update notice, `doctor`, frontend-drift check and `summary`/`validate`. Verify: ported `test_update`, `test_frontend`, `test_cli_auth` pass; `autocalc doctor` runs on Windows and Linux.
- [ ] 5.3 Match CLI syntax and exit codes with `docs/reference/cli.md`. Verify: a CLI contract test runs each documented command with `--help` and compares to the reference.

## 6. Parity gate (dev-quality delta)

- [ ] 6.1 Registry diff (1.2) reports zero differences. Verify: the script exits 0 in CI.
- [ ] 6.2 Golden-corpus Edit agreement on both implementations, every verified service, four regions. Verify: local run with session and corpus prints zero mismatches for each implementation.
- [ ] 6.3 CI runs the TypeScript offline suite on `ubuntu-latest` and `windows-latest`. Verify: both jobs green on the PR.

## 7. Distribution

- [ ] 7.1 Write ADR-0019 (distribution of the TypeScript tool; supersedes ADR-0013) and write the `distribution` spec delta in the same step. Verify: `openspec validate ts-parity` passes and the ADR index lists 0019.
- [ ] 7.2 Update `install.sh`, `install.ps1` and the update path to the chosen method. Verify: a clean Linux and a clean Windows machine install, register the MCP server, run `autocalc doctor` and `autocalc update`.

## 8. Cutover

- [ ] 8.1 Accept ADR-0017 and mark ADR-0013 superseded in the ADR index. Verify: `docs/adr/index.md` shows the new statuses.
- [ ] 8.2 Move `experimental/bun/*` to the repo root; delete `src/autocalc`, `pyproject.toml`, `uv.lock`, Python tests and helpers. Verify: `bun run check && bun run test:offline` pass from the root and no Python file remains.
- [ ] 8.3 Update `dev-quality` requirements (offline marker, lint, helpers) and the `mcp-surface` wording that names Python builders to the TypeScript tooling, in one delta. Verify: `openspec validate ts-parity` passes.
- [ ] 8.4 Update README, CONTRIBUTING, `docs/how-to/*`, `mkdocs.yml`, `.github/workflows/*` for Bun. Verify: `grep -ri "uv \|pytest\|ruff" README.md CONTRIBUTING.md docs` finds none outside historical ADRs, and CI is green.
- [ ] 8.5 Tag the first TypeScript release. Verify: the installer from the new tag installs and `autocalc doctor` is healthy on both OSes.

## Workflow follow-up

- Run `openspec archive ts-parity` after 8.5.
- Open a separate change for the page-interaction robustness rework on the TypeScript base.
