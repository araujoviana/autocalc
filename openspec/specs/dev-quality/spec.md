# dev-quality Specification

## Purpose

Keep the repository healthy for contributors: an offline test suite anyone can run, an
automated gate on lint and tests for every change, and a tree that never holds credentials,
user data or redistributed third-party bundles.

## Requirements

### Requirement: Offline suite needs no network or credentials
The test suite, excluding tests marked `live`, SHALL pass on a fresh clone with no network
access beyond installing dependencies, no saved session, and no corpus fixtures. Any test that
calls the calculator backend or reads `tests/fixtures/corpus/` SHALL carry the `live` marker.

#### Scenario: Fresh clone runs offline tests
- **WHEN** a contributor clones the repo, installs the dev dependencies and runs
  `pytest -m "not live"` with networking disabled and no session stored
- **THEN** every selected test passes and none is skipped for missing credentials or fixtures

#### Scenario: Network test without the marker
- **WHEN** a test that reaches the calculator backend lacks the `live` marker
- **THEN** the offline CI run fails, which flags the missing marker

### Requirement: CI gate on every change
Every push and pull request SHALL trigger an automated check that installs the project from
its lockfile, runs the project's lint configuration, and runs the offline suite. The check
SHALL fail if lint reports any finding or any offline test fails. It SHALL NOT need repository
secrets.

#### Scenario: Pull request with a lint finding
- **WHEN** a pull request introduces an unused import in `src/autocalc/`
- **THEN** the CI check fails at the lint step and reports the file and rule

#### Scenario: Pull request with a failing offline test
- **WHEN** a pull request breaks an offline test
- **THEN** the CI check fails at the test step

#### Scenario: Clean change
- **WHEN** a push has no lint findings and all offline tests pass
- **THEN** the CI check succeeds without reading any secret

### Requirement: Lint runs the same locally and in CI
The lint rule set and settings SHALL live in the project configuration, and the lint tool
SHALL be pinned in the dev dependency group, so that a local run and the CI run give the same
result for the same tree regardless of the contributor's user-level settings.

#### Scenario: Contributor with a personal ruff config
- **WHEN** a contributor whose user-level ruff config enables extra rules runs the project's
  lint command
- **THEN** the result matches the CI result for the same commit

### Requirement: Test helpers are importable without path manipulation
Shared test helpers (corpus rebuilders, golden comparison, render checks) SHALL live in a
package under `tests/` and be imported as that package. The test configuration SHALL NOT
modify `sys.path` to reach them.

#### Scenario: Running a single test file
- **WHEN** a contributor runs `pytest tests/test_builders_golden.py -m live` from the repo root
- **THEN** the helper imports resolve without any `sys.path` change in `conftest.py`

### Requirement: Sensitive and third-party material stays out of the tree
The repository SHALL NOT track session files, saved-list corpus fixtures, or copies of
Huawei's calculator frontend bundle. Contributors who need the bundle SHALL fetch it on demand
into a gitignored location with a provided script.

#### Scenario: Fetching the bundle for token recovery
- **WHEN** a contributor needs `addToList_*` label tokens for a service with no corpus card
- **THEN** the documented script downloads the current frontend bundle into a gitignored
  path, and the docs point at that script rather than a committed file

#### Scenario: Accidental staging
- **WHEN** a contributor runs `git status` after fetching the bundle, logging in, or pulling
  the corpus
- **THEN** none of the bundle, session file or corpus files appear as untracked
