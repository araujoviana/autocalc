## MODIFIED Requirements

### Requirement: Offline suite needs no network or credentials
The offline test suite (`tests/unit` and `tests/integration`, excluding `tests/live`) SHALL pass on
a fresh clone with no network access beyond installing dependencies, no saved session, and no
corpus fixtures. Any test that calls the live calculator backend SHALL live under `tests/live/` or
guard on corpus availability. Documentation contract tests in the offline suite SHALL verify
that `docs/architecture.md` exists and is indexed, and that generated service reference counts match
the runtime verified service set.

#### Scenario: Fresh clone runs offline tests
- **WHEN** a contributor clones the repo, installs the dependencies (`bun install --frozen-lockfile`) and runs `bun run test:offline` with networking disabled and no session stored
- **THEN** every selected test passes and none fails for missing credentials or corpus fixtures

#### Scenario: Network test without the marker
- **WHEN** a test in `tests/unit` or `tests/integration` reaches the live calculator backend
- **THEN** the offline CI run fails, which flags the misplaced live test

#### Scenario: Docs contract validates architecture entrypoint and verified counts
- **WHEN** `bun test tests/unit/docs-contract.test.ts` runs after `bun run docs:generate`
- **THEN** it verifies `docs/architecture.md` is present and navigated in `mkdocs.yml`, and `docs/reference/services/index.md` matches the live runtime count of `VERIFIED` services
