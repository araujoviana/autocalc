## ADDED Requirements

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
