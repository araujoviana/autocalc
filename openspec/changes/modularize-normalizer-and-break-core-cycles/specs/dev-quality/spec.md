## MODIFIED Requirements

### Requirement: CI gate on every change
Every push and pull request SHALL trigger an automated check that installs the project from
its lockfile, runs the project's typecheck and boundary checks (including detecting circular
relative module imports within `src/`), and runs the offline suite. The check
SHALL fail if typecheck/boundary checks report any finding or any offline test fails. It SHALL NOT
need repository secrets.

#### Scenario: Pull request with a lint finding
- **WHEN** a pull request introduces a type error or a forbidden interface import in `src/core/`
- **THEN** the CI check fails at the check step and reports the file and rule

#### Scenario: Pull request introducing a circular import
- **WHEN** a pull request introduces a relative import cycle among modules under `src/`
- **THEN** `bun run check:boundaries` fails and names the cycle path

#### Scenario: Pull request with a failing offline test
- **WHEN** a pull request breaks an offline test
- **THEN** the CI check fails at the test step

#### Scenario: Clean change
- **WHEN** a push has no check findings and all offline tests pass
- **THEN** the CI check succeeds without reading any secret
