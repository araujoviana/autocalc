# Tasks

## 1. Lint configuration and cleanup

- [x] 1.1 Add `ruff` to `[dependency-groups].dev` and a `[tool.ruff]` table to `pyproject.toml` per design D1/D2 (E/F/W/I/B/UP, line length 120, py311, E501 ignored, generated agent dirs and `docs/` excluded); verify `uv sync --group dev` succeeds and `uv run ruff check --show-settings src` reports the project `pyproject.toml` as its config source
- [x] 1.2 Run `uv run ruff check --fix` (safe fixes only) over `src/` and `tests/`; verify the remaining findings are only the manual categories (E702, B904, B905, B007, F841, B017)
- [x] 1.3 Fix the remaining findings by hand per design D6 (split semicolon lines, `raise ... from`, explicit `zip(strict=...)`, `_` loop vars, specific exception in the B017 test); verify `uv run ruff check` exits 0 and `uv run pytest -m "not live"` still passes all 23 tests
- [x] 1.4 Verify no behavior change from the lint fixes by running `uv run pytest -m live` on a machine with the corpus, and confirm the pass/fail set matches a run on the pre-change commit (known catalog-drift failures documented in CAVEATS are allowed)

## 2. Test helper package

- [x] 2.1 Create `tests/__init__.py` and `tests/support/__init__.py`, then `git mv` the 12 helper modules (`*_rebuild.py`, `golden.py`, `render.py`, `template_audit.py`) into `tests/support/`; verify `git status` shows them as renames
- [x] 2.2 Rewrite helper imports to the package (`from tests.support import golden`, `importlib.import_module(f"tests.support.{name}")`) in the test modules and inside the helpers themselves; set `pythonpath = .` in `pytest.ini` and delete the `sys.path` loop from `tests/conftest.py`; verify `grep -n sys.path tests/conftest.py` is empty and `uv run pytest -m "not live"` passes
- [x] 2.3 Verify live collection still resolves: `uv run pytest -m live --collect-only -q` lists the same 29 tests as before the move, and `uv run python -m tests.support.template_audit --help` (or its no-arg run) starts without ImportError
- [x] 2.4 Update docs that reference old helper paths (`README.md` `tests/render.py` command, `docs/CAVEATS.md` `tests/golden.compare_cards` and `tests/template_audit.py`); verify `grep -rn "tests/render.py\|tests/golden\|tests/template_audit" README.md docs/` returns nothing

## 3. Offline suite independence

- [x] 3.1 Move `tests/fixtures/corpus` aside temporarily and run `uv run pytest -m "not live"` with no stored session (`AUTOCALC_DATA` pointed at an empty temp dir); verify all offline tests pass and none skip, adding the `live` marker or fixing import-time corpus reads wherever they fail; restore the corpus afterwards

## 4. Remove the vendored bundle

- [x] 4.1 Add `scripts/fetch_bundle.py` per design D5 (scrape version from `calculator.html`, optional `--version`, write `.cache/bundle/framework-<ver>.js`, non-zero exit with a clear message on failure) and add `.cache/` to `.gitignore`; verify `uv run python scripts/fetch_bundle.py` prints a path to a file containing `URIMAP`, and `git status` shows nothing new
- [x] 4.2 `git rm docs/evidence/bundle/framework.js` (and the now-empty `docs/evidence/`); verify `git ls-files docs/evidence` is empty
- [x] 4.3 Update `docs/CAVEATS.md`, `README.md` and `docs/BACKLOG.md` (D1 contract test) to point at the fetch script instead of the committed file, and add the one-line history recovery note (`git show 5644802:docs/evidence/bundle/framework.js`) to CAVEATS; verify `grep -rn "docs/evidence" README.md docs/ src/` returns nothing

## 5. CI workflow

- [x] 5.1 Add `.github/workflows/ci.yml` per design D3 (push + pull_request, `contents: read`, checkout → setup-uv with cache → `uv sync --locked --group dev` → `uv run ruff check` → `uv run pytest -m "not live"`, no secrets); verify the workflow file parses (`gh workflow view` after push, or `actionlint` locally if available)
- [x] 5.2 Add a short "Development" section to `README.md` listing the three local commands that mirror CI (`uv sync --group dev`, `uv run ruff check`, `uv run pytest -m "not live"`) and the bundle fetch script; verify each command runs as written from a clean shell

## 6. Integration check

- [x] 6.1 Push the branch and confirm the CI run is green on GitHub; then push a throwaway commit with an unused import to confirm the lint step fails, and revert it
- [x] 6.2 Run `openspec validate repo-hygiene --strict` and verify it passes

## Workflow follow-up

- Open a PR from the branch to `main` once CI is green.
- Archive the change with `/opsx:archive repo-hygiene` after merge; this creates `openspec/specs/dev-quality/spec.md`.
