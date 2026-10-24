## MODIFIED Requirements

### Requirement: Auth errors tell the agent what to do
A write tool called without a valid session SHALL fail with `AUTH_EXPIRED` and a hint. The agent
SHALL be able to call `auth_login`, which opens the browser and waits up to `wait_seconds`
(default 45). When the user has not finished by then it SHALL return `waiting: true` and keep the
sign-in running for up to 5 minutes; `auth_status` SHALL report the outcome. Calling `auth_login`
while a sign-in is running SHALL wait on that one, not open a second browser.

#### Scenario: Logged out create
- **WHEN** `publish_quote` is called with no session
- **THEN** the result is `AUTH_EXPIRED` with a hint to call `auth_login` or run `autocalc login`

#### Scenario: Slow sign-in
- **WHEN** the user takes longer than `wait_seconds` to sign in
- **THEN** `auth_login` returns `waiting: true`, and `auth_status` reports `logged_in: true` once they finish

## ADDED Requirements

### Requirement: Builder options are discoverable and checked at draft time
`supported_services` SHALL list the option names each service accepts. `draft_quote` SHALL reject
a requirement whose options include a name the service does not accept, with a `VALIDATION`
error naming the field and the allowed options, and save no draft.

#### Scenario: Typo in an option
- **WHEN** `draft_quote` gets an `ecs` requirement with option `sytem_disk`
- **THEN** it fails with `VALIDATION` listing the allowed ECS options

### Requirement: Region listing only lists
`list_regions` SHALL take only an optional `service` and return region ids with display names.

#### Scenario: Regions of one service
- **WHEN** the agent calls `list_regions` with `service: "ecs"`
- **THEN** only the regions where ECS is sold are returned
