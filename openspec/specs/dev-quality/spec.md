# dev-quality Specification

## Purpose

Keep the repository healthy for contributors: an offline test suite anyone can run, an
automated gate on lint and tests for every change, and a tree that never holds credentials,
user data or redistributed third-party bundles.

## Requirements

### Requirement: Offline suite needs no network or credentials
The offline test suite (`tests/unit` and `tests/integration`, excluding `tests/live`) SHALL pass on
a fresh clone with no network access beyond installing dependencies, no saved session, and no
corpus fixtures. Any test that calls the live calculator backend SHALL live under `tests/live/` or
guard on corpus availability.

#### Scenario: Fresh clone runs offline tests
- **WHEN** a contributor clones the repo, installs the dependencies (`bun install --frozen-lockfile`) and runs `bun run test:offline` with networking disabled and no session stored
- **THEN** every selected test passes and none fails for missing credentials or corpus fixtures

#### Scenario: Network test without the marker
- **WHEN** a test in `tests/unit` or `tests/integration` reaches the live calculator backend
- **THEN** the offline CI run fails, which flags the misplaced live test

### Requirement: CI gate on every change
Every push and pull request SHALL trigger an automated check that installs the project from
its lockfile, runs the project's typecheck and boundary checks, and runs the offline suite. The check
SHALL fail if typecheck/boundary checks report any finding or any offline test fails. It SHALL NOT
need repository secrets.

#### Scenario: Pull request with a lint finding
- **WHEN** a pull request introduces a type error or a forbidden interface import in `src/core/`
- **THEN** the CI check fails at the check step and reports the file and rule

#### Scenario: Pull request with a failing offline test
- **WHEN** a pull request breaks an offline test
- **THEN** the CI check fails at the test step

#### Scenario: Clean change
- **WHEN** a push has no check findings and all offline tests pass
- **THEN** the CI check succeeds without reading any secret

### Requirement: Lint runs the same locally and in CI
The typecheck and boundary rule set and settings SHALL live in the project configuration
(`tsconfig.json` and `scripts/check-boundaries.ts`), and the toolchain SHALL be pinned in
`package.json` and `bun.lock`, so that a local run and the CI run give the same result for the
same tree regardless of the contributor's user-level settings.

#### Scenario: Contributor with a personal ruff config
- **WHEN** a contributor runs `bun run check && bun run check:boundaries`
- **THEN** the result matches the CI result for the same commit

### Requirement: Test helpers are importable without path manipulation
Shared test helpers (corpus rebuilders, golden comparison, region sweep) SHALL live under
`tests/support/` and be imported via standard relative module imports without runtime path
mutation.

#### Scenario: Running a single test file
- **WHEN** a contributor runs `bun test tests/unit/golden.test.ts` from the repo root
- **THEN** the helper imports resolve directly through `tests/support/`

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

### Requirement: An implementation is replaced only after a parity gate passes
When one implementation of autocalc replaces another, the replaced implementation SHALL stay
in the tree and stay the released one until a parity check passes against the replacement. The
check SHALL show that both expose the same MCP tool names and input schemas, that the same
offline scenarios from `openspec/specs/` pass on both, and that the golden-corpus Edit
agreement holds on both. A failing check SHALL block the removal.

#### Scenario: Replacement is missing a tool
- **WHEN** the parity check runs and the replacement lacks a tool the current implementation exposes
- **THEN** the check fails naming the missing tool, and the current implementation is not removed

#### Scenario: Replacement disagrees with the website
- **WHEN** a golden-corpus card built by the replacement re-prices differently on the calculator's Edit page than the current implementation's card
- **THEN** the check fails naming the service, and the current implementation is not removed

#### Scenario: Parity reached
- **WHEN** tool names, schemas, offline scenarios and the golden-corpus checks all agree on Windows and Linux
- **THEN** the check passes and the replaced implementation may be removed in a single change
