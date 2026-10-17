# huawei/auth-sessions Specification

## Purpose

Let a user sign in to their Huawei Cloud account once and keep that session usable for writes, without the tool ever handling the password or exposing the session.

## Requirements

### Requirement: One-time browser login
Login SHALL open a headed browser with a persistent per-profile directory on the calculator page
and wait, up to a timeout (default 5 minutes), for the user to sign in by hand. The tool SHALL
never see or handle the password, which covers MFA, captcha and SSO.

#### Scenario: Successful login
- **WHEN** the user runs `autocalc login` and signs in in the opened window
- **THEN** the session is verified against `share/list`, stored, and the masked account is reported

### Requirement: Session storage is protected
The session SHALL be stored in the OS keyring when one is available, otherwise in
`~/.config/autocalc/session.json` (or `session-<profile>.json`) with mode 0600. Cookie values
SHALL never be logged or shown. Status and errors SHALL show cookie names only.

#### Scenario: Host without Secret Service
- **WHEN** no keyring backend is available (typical on WSL)
- **THEN** the session is written to the JSON file with permissions 0600

#### Scenario: Redaction
- **WHEN** a cookie header appears in an error or in `auth status`
- **THEN** only cookie names are shown, never values

### Requirement: Writes use the stored session
Write calls SHALL authenticate with the stored cookie jar. A `csrf` cookie, when present, SHALL
also be sent as a `csrf` header.

#### Scenario: CSRF header
- **WHEN** the stored jar contains `csrf=<v>`
- **THEN** write requests carry header `csrf: <v>`

### Requirement: Silent refresh before failing
When a write call returns `CBC.0101`, the system SHALL re-capture cookies headlessly from the
persistent browser profile and retry once. Only if that fails SHALL it raise `AUTH_EXPIRED`
with the hint to run `autocalc login`.

#### Scenario: Stale calculator session, valid SSO
- **WHEN** `share/add` returns `CBC.0101` and the profile's SSO cookie is still valid
- **THEN** the call succeeds after a silent refresh with no user action

#### Scenario: Expired SSO
- **WHEN** silent refresh cannot obtain a valid session
- **THEN** `AUTH_EXPIRED` is raised with the hint `autocalc login`

### Requirement: Named profiles
Sessions and browser profiles SHALL be per named profile, selected by `--profile` or
`AUTOCALC_PROFILE`, defaulting to `default`.

#### Scenario: Second account
- **WHEN** the user logs in with `--profile partnerX`
- **THEN** the default profile's session is untouched

### Requirement: Session import fallback
A user SHALL be able to import a session from a browser "Copy as cURL" (clipboard or file). A
legacy repo `.session.curl` SHALL be imported once into the store and then deleted.

#### Scenario: Legacy file
- **WHEN** a `.session.curl` exists in the repo and no session is stored
- **THEN** it is migrated into the store and the file is removed
