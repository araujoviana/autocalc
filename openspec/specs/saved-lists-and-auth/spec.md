# saved-lists-and-auth Specification

## Purpose

Let a user sign in once and then create, read and manage saved calculator lists with share
links, while keeping the account session cookie safe and catching render glitches before a
customer sees them.

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

### Requirement: HWS_INTL_ID authenticates
Write calls SHALL authenticate with the stored cookie jar. `HWS_INTL_ID` alone authenticates
`share/*`; `cbc-sid` alone does not. A `csrf` cookie, when present, SHALL also be sent as a
`csrf` header.

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

### Requirement: Only write endpoints need a session
`share/add`, `share/list`, `share/update`, `share/delete`, `share/copy` and `formExport` SHALL
require a session. Catalog, rating, currency and `share/detail` SHALL NOT.

#### Scenario: Read someone's link while logged out
- **WHEN** no session exists and a caller reads a share link
- **THEN** the list is returned

### Requirement: Saved-list lifecycle
The system SHALL create a list from cards (`share/add`) and return its id and share link
`calculator.html?shareListId=<id>&currentCurrency=<CUR>`. It SHALL also list the account's
lists, rename (read + update), duplicate (`share/copy`, optional rename) and delete lists by id
or share URL.

#### Scenario: Create and share
- **WHEN** a list is created with currency BRL
- **THEN** the returned URL ends with `shareListId=<id>&currentCurrency=BRL` and opens without login

#### Scenario: Accepts URL or id
- **WHEN** a caller passes a full share URL to rename, duplicate, delete or read
- **THEN** the id is extracted from `shareListId=` and used

### Requirement: Saved-list validation
`autocalc validate <id>` SHALL read a list anonymously and report: non-finite values
(NaN/undefined/Infinity as values, not substrings), missing required card or product fields,
products with productNum ≤ 0, selectIndex not 0..n-1, RI cards missing selected-level
aggregates, and card or list totals off by more than 0.02 from the sum of their parts.

#### Scenario: Broken RI card
- **WHEN** a saved RI card lacks `perAmount` at the selected level
- **THEN** validate reports it and `ok` is false

#### Scenario: Word containing "nan"
- **WHEN** a label contains "Governance"
- **THEN** validate does not report a NaN
