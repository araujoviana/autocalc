## ADDED Requirements

### Requirement: Tool results carry an update notice at most once a day
When a newer semver release tag exists than the installed version, object-shaped tool results
SHALL carry an `update_notice` naming the new version and `autocalc update`. The tag lookup SHALL
run at most once a day, SHALL NOT fail the tool call, SHALL NOT update anything, and SHALL be
disabled by `AUTOCALC_NO_UPDATE_CHECK`.

#### Scenario: Newer release
- **WHEN** the newest tag is `v0.2.0`, `0.1.0` is installed and no lookup ran today
- **THEN** the result carries an `update_notice` naming `0.2.0`, and a second result the same day carries none

#### Scenario: Offline
- **WHEN** the tag lookup fails
- **THEN** the tool result is returned unchanged
