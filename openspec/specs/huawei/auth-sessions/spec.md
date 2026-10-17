# huawei/auth-sessions Specification

## Purpose

Let a user sign in to their Huawei Cloud account once and keep that session usable for writes, without the tool ever handling the password or exposing the session.

## Requirements

### Requirement: One-time browser login
Login SHALL open a headed browser with a persistent per-profile directory on the calculator page
and wait, up to a timeout (default 5 minutes), for the user to sign in by hand. The tool SHALL
never see or handle the password, which covers MFA, captcha and SSO. On success, login SHALL
save the session's cookie header to an owner-only file inside the browser profile directory, and
SHALL NOT copy cookies anywhere else.

#### Scenario: Successful login
- **WHEN** the user runs `autocalc login` and signs in in the opened window
- **THEN** the session is verified against the calculator's saved-list endpoint, the masked
  account is reported, the session is saved inside the profile directory, and nothing is
  written outside it or to the keyring

#### Scenario: Login window times out
- **WHEN** the user does not finish signing in before the timeout
- **THEN** `AUTH_LOGIN_FAILED` is raised with a hint to run `autocalc login` again

### Requirement: Silent refresh before failing
When a write call reports an invalid session, the system SHALL re-read the session from the
browser profile headlessly and retry the call once. Only if that fails SHALL it delete the saved
session and raise `AUTH_EXPIRED` with the hint to run `autocalc login`.

#### Scenario: Stale calculator session, valid SSO
- **WHEN** saving a list reports an invalid session and the profile is still signed in
- **THEN** the call succeeds after a silent re-read with no user action

#### Scenario: Expired SSO
- **WHEN** the re-read profile is no longer signed in
- **THEN** `AUTH_EXPIRED` is raised with the hint `autocalc login`

### Requirement: Named profiles
Sessions and browser profiles SHALL be per named profile, selected by `--profile` or
`AUTOCALC_PROFILE`, defaulting to `default`.

#### Scenario: Second account
- **WHEN** the user logs in with `--profile partnerX`
- **THEN** the default profile's session is untouched

### Requirement: Writes read the session from the profile
Write calls SHALL take their session from the active profile's browser profile directory: the
session saved there at login, or, when none is saved, the browser profile opened headlessly once
and closed before the write is sent. A process SHALL read the session at most once for its first
write and keep it in memory for later writes. A `csrf` cookie, when present, SHALL also be sent
as a `csrf` header. Without a usable profile, a write SHALL fail with `AUTH_EXPIRED` and the hint
`autocalc login`.

#### Scenario: Several writes in one process
- **WHEN** one process saves a list and then lists the saved lists
- **THEN** the session is read once, and both calls succeed

#### Scenario: Saved session after login
- **WHEN** the user has logged in and a later process writes
- **THEN** the write uses the saved session without opening a browser

#### Scenario: CSRF header
- **WHEN** the profile's session contains `csrf=<v>`
- **THEN** write requests carry header `csrf: <v>`

#### Scenario: Never logged in
- **WHEN** a write is attempted and the active profile has no browser profile directory
- **THEN** `AUTH_EXPIRED` is raised with the hint `autocalc login`, without opening a browser

### Requirement: Session secrets never leave the profile
Cookie values SHALL NOT be written to any file outside the browser profile directory, nor to a
keyring, log, error or tool result. The saved session file SHALL be readable by its owner only.
Status output and errors SHALL show cookie names and counts only.

#### Scenario: Redaction
- **WHEN** session cookies appear in an error or in `auth status`
- **THEN** only cookie names are shown, never values

#### Scenario: No copies on disk
- **WHEN** a user logs in, saves a list and runs `auth status`
- **THEN** no file outside the browser profile directory and no keyring entry contains a
  cookie value

### Requirement: System browser first
The browser used for login and for reading the profile SHALL be chosen in this order, on both
Windows and Linux: the `AUTOCALC_BROWSER` override, then an installed Google Chrome, then an
installed Microsoft Edge, then a Chromium found on `PATH`, then the browser bundled with the
automation library. `auth status` and `doctor` SHALL report which one was chosen.

#### Scenario: Windows with Edge only
- **WHEN** the machine is Windows with Edge installed and no Chrome, and `AUTOCALC_BROWSER` is unset
- **THEN** login opens Edge

#### Scenario: Override
- **WHEN** `AUTOCALC_BROWSER` names a browser executable
- **THEN** that executable is used even if Chrome is installed

#### Scenario: Automation library upgrade
- **WHEN** the automation library is upgraded and its bundled browser is not installed, but
  Chrome is
- **THEN** login and writes still work

### Requirement: Busy profile fails fast
When the browser profile is already open in another process, opening it SHALL fail with
`AUTH_PROFILE_BUSY` and a hint naming both fixes: close the other window or autocalc process,
or use another profile with `--profile`.

#### Scenario: Login window still open
- **WHEN** an `autocalc login` window is open and another process needs to open the same
  browser profile (no saved session, or a re-read after `CBC.0101`)
- **THEN** it fails with `AUTH_PROFILE_BUSY` and the hint, not a raw browser error

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
