# Tasks

## 1. OpenSpec project rules

- [x] 1.1 Add `context:` and `rules:` (proposal, specs, tasks) to `openspec/config.yaml` per design D8; verify `openspec instructions proposal --change docs-foundation --json` shows them in `context`/`rules`
- [x] 1.2 Confirm the six `huawei/*` deltas and five retirement deltas match the baseline word-for-word except the two D3 edits: diff each ADDED block against `openspec/specs/<old>/spec.md`; `openspec validate docs-foundation --strict` passes

## 2. Docs site skeleton

- [x] 2.1 Add a `docs` dependency group with `mkdocs-material>=9.7,<10` to `pyproject.toml` and refresh `uv.lock`; verify `uv sync --locked --group docs` succeeds
- [x] 2.2 Create `mkdocs.yml` (Material theme, nav for the four Diátaxis quadrants + ADRs, admonition, pymdownx superfences/tabbed, search) and `docs/index.md`; verify `uv run --group docs mkdocs build --strict` succeeds
- [ ] 2.3 Add a "Docs" step to `.github/workflows/ci.yml` (`uv sync --locked --group dev --group docs`, then `mkdocs build --strict`); verify it is green on push
- [x] 2.4 Add `site/` to `.gitignore`; verify `git status` is clean after a local build

## 3. Architecture Decision Records

- [x] 3.1 Write `docs/adr/0000-record-architecture-decisions.md` (MADR 4 minimal template, status/date frontmatter, the specs/ADR/docs division of labour) and `docs/adr/index.md`; verify both render in the strict build
- [x] 3.2 Write ADRs 0001–0005 (page as encoder; link is the deliverable; fail-closed gate; USD list prices only; ranking + auto-confirm), each with context, the options considered, the decision and the evidence it cites; verify the strict build passes and each file has `status: accepted`
- [x] 3.3 Write ADRs 0006–0010 (refuse unsupported; workflow surface + one registry; MCP output format with the 3345→794 token measurement; traceability run records; concurrency by state with the 2.12 s→0.89 s identical-amounts measurement); verify as in 3.2
- [x] 3.4 Write ADRs 0011–0015 (auth: profile is the credential + system browser; Windows+Linux; distribution via uv tool + install.sh/ps1; saved-list naming + prune; strangler core + AWS second); verify as in 3.2

## 4. Explanation pages (CAVEATS split)

- [x] 4.1 Create `docs/explanation/architecture.md` (provider core vs `huawei/`, what lives in specs vs ADRs vs docs); verify the strict build passes
- [x] 4.2 Move each `docs/CAVEATS.md` section into its `docs/explanation/huawei/*.md` page per design D6, updating spec citations to the `huawei/…` paths, generalizing or dropping "Sizing rules of thumb", and rewriting "Provider rate limits" as `concurrency.md`; verify every CAVEATS heading is accounted for (checklist in the commit message) and the strict build passes
- [x] 4.3 Move the cookie-bisection observation (formerly requirement "HWS_INTL_ID authenticates") into `explanation/huawei/sessions.md`; verify with `grep -rln HWS_INTL_ID openspec/changes/docs-foundation/specs/huawei` → no hits (the retirement delta must still name the removed requirement) and `docs/explanation/huawei/sessions.md` → hit
- [x] 4.4 Delete `docs/CAVEATS.md` and repoint every reference (README, source docstrings, tests); verify `grep -rn CAVEATS --exclude-dir=.git --exclude-dir=openspec .` → no hits

## 5. Tutorials, how-to, reference

- [x] 5.1 Write `docs/tutorials/first-quote.md` against today's CLI (login → search → quote → create list); verify each command in it runs as written on Linux
- [x] 5.2 Write how-tos `refresh-corpus.md` (`uv run python -m tests.support.pull_corpus`), `fetch-bundle.md` (`scripts/fetch_bundle.py`) and `run-tests.md` (the three CI commands + `-m live`); verify the strict build passes
- [x] 5.3 Write `docs/reference/errors.md` from `src/autocalc/errors.py` (code, meaning, hint) and `docs/reference/cli.md` from `autocalc --help`; verify every error class in `errors.py` appears
- [x] 5.4 Trim `README.md` to a pitch, quick start and a link to the docs; move the long auth/cookie sections into the docs; verify no README section duplicates a docs page

## 6. BACKLOG retirement

- [x] 6.1 Triage every `docs/BACKLOG.md` item into done / planned (named change) / decided (ADR #) / open per design D7, and record the table in the commit message; verify each `###` heading in BACKLOG appears exactly once in the table
- [x] 6.2 Delete `docs/BACKLOG.md` and repoint references; verify `grep -rn BACKLOG --exclude-dir=.git --exclude-dir=openspec .` → no hits

## 7. Leak and consistency checks

- [x] 7.1 Grep all new and changed docs for customer names from the local `tests/fixtures/corpus/index.json` (script run locally, output not committed); verify zero hits
- [x] 7.2 Run `uv run ruff check`, `uv run pytest -m "not live"`, `uv run --group docs mkdocs build --strict` and `openspec validate docs-foundation --strict`; all pass

## Workflow follow-up

- Archive with `/opsx:archive docs-foundation`, then delete the five emptied `openspec/specs/{catalog-access,rating,card-building,region-availability,saved-lists-and-auth}` directories in the same commit and check with `openspec validate --specs --strict`.
- Hand the "open" BACKLOG items to the user to file as GitHub issues (outward-facing, so the user does it).
- Next change: `auth-sessions` (spec delta + code for ADR-0011), then `spa-encoder-poc`.
