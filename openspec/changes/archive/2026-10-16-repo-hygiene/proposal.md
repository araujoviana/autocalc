# Proposal

## Why

Nothing checks the code automatically. The only GitHub workflow installs the OpenSpec CLI for
Copilot; the 23 offline tests and any lint run only when someone remembers. The test directory
mixes corpus-rebuild helpers with test modules and reaches them through a `sys.path` hack. The
repo also carries a 2.8 MB minified copy of Huawei's calculator bundle
(`docs/evidence/bundle/framework.js`): it is third-party code we have no clear right to
redistribute, and it goes stale with every frontend release anyway. Fixing these now, while the
codebase is small and the specs are freshly baselined, keeps future changes cheap to review.

## What Changes

- Add a CI workflow that, on every push and pull request, installs the project with `uv`, runs
  `ruff check`, and runs the offline test suite (`pytest -m "not live"`). It needs no network
  access beyond package installation and no credentials.
- Add a project ruff configuration to `pyproject.toml` (rule set and line length agreed in
  design.md), add `ruff` to the dev dependency group, and fix the existing findings so the
  gate starts green.
- Move the non-test helper modules in `tests/` (`*_rebuild.py`, `golden.py`, `render.py`,
  `template_audit.py`) into a `tests/support/` package and import them as a package. Remove
  the `sys.path` manipulation from `tests/conftest.py`. Test behavior and the `live` marker
  stay as they are.
- **BREAKING (contributors only):** delete `docs/evidence/bundle/framework.js` from the tree.
  Add a small script that downloads the current bundle into a gitignored path on demand, and
  point `docs/CAVEATS.md`, `README.md` and `docs/BACKLOG.md` at that script instead of the
  committed file.

Out of scope: `ruff format` across the codebase (45 files would change; churn with no
behavior gain), rewriting git history to purge the bundle, a LICENSE file, and the live/golden
test job (it needs the gitignored corpus fixtures).

## Capabilities

### New Capabilities
- `dev-quality`: the contributor-facing contract for keeping the repo healthy: an offline test
  suite that runs without network or credentials, an automated CI gate on lint and offline
  tests, and the rule that credentials, user data and third-party bundles never enter the tree.

### Modified Capabilities

None. The product capabilities (catalog-access, rating, card-building, region-availability,
saved-lists-and-auth, mcp-surface) keep their requirements; nothing user-visible changes.

## Impact

- New: `.github/workflows/ci.yml`, `tests/support/` package, a bundle-fetch script under
  `scripts/`, `openspec/specs/dev-quality/spec.md` (on archive).
- Changed: `pyproject.toml` (ruff config, dev group), `.gitignore` (fetched bundle path),
  `tests/conftest.py` and the `test_*.py` modules (imports), source files touched by lint fixes
  in `src/autocalc/` (no behavior change), `docs/CAVEATS.md`, `README.md`, `docs/BACKLOG.md`.
- Removed: `docs/evidence/bundle/framework.js`. Git history still contains it.
- No runtime dependency changes; `ruff` is dev-only.
