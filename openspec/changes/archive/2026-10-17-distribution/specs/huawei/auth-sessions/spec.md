# huawei/auth-sessions delta

## MODIFIED Requirements

### Requirement: Legacy sessions are deleted
Session copies written by earlier versions (the `session.json` or `session-<profile>.json` file)
SHALL be deleted once, the first time an auth-related command runs after upgrading, and again by
`autocalc logout`. The one-time pass SHALL NOT run again after it has completed. autocalc SHALL
NOT depend on the OS keyring; entries an earlier version left there are not touched.

#### Scenario: First run after upgrading
- **WHEN** a `session.json` from an earlier version exists and the user runs any command that reads the session
- **THEN** it is deleted, and later runs do not look for it again

#### Scenario: Logout
- **WHEN** the user runs `autocalc logout`
- **THEN** the profile is signed out and any legacy session file is deleted
