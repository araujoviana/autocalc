# Proposal

## Why

Saving a list depends on three copies of one secret: the browser profile, cookies exported from
it into the OS keyring or a 0600 file, and an optional "Copy as cURL" import. The exported copies
go stale, leak more easily than the profile, and on 2026-10-16 login broke outright when a
Playwright upgrade expected a browser build that wasn't installed. ADR-0011 decided the profile
is the only credential and a system browser drives it. This change makes the code and the
`huawei/auth-sessions` spec say so.

## What Changes

- Write calls read cookies from the browser profile at call time. The profile is opened headless
  once per process, the cookies are kept in memory for that process, and the browser is closed
  again. A stale session (`CBC.0101`) reopens the profile once before failing with
  `AUTH_EXPIRED`.
- **BREAKING:** the stored session is removed: `SessionStore`, the keyring and 0600-file copies,
  `autocalc auth import`, the `AUTOCALC_SESSION` cURL file and the repo `.session.curl`
  fallback. Users who relied on import run `autocalc login` once.
- Leftover sessions from earlier versions are deleted once: the keyring entry and the
  `session*.json` files. `autocalc logout` also deletes them, as well as signing the profile out.
- Browser discovery covers Windows and Linux: `AUTOCALC_BROWSER`, then installed Chrome, then
  Edge (Playwright channels), then a Chromium on `PATH`, then Playwright's bundled build. `auth
  status` and `doctor` report which browser was chosen.
- A profile already open in another process fails fast with a new `AUTH_PROFILE_BUSY` error
  that says how to fix it, instead of a raw Playwright exception.
- `auth status` checks the profile live (headless) instead of reading a stored file.
- A time-boxed, read-only look at the calculator's CPQ token (`cpqjwt`), with the finding
  written into `docs/explanation/huawei/sessions.md` and the roadmap row removed.

### Out of scope

- Moving config, data and the profile to platformdirs locations. Paths stay where they are, so
  nobody has to log in again; the move belongs to `distribution`.
- Dropping the `keyring` dependency. It stays only so the cleanup can delete old entries; a
  roadmap row tracks removing it in `distribution`.
- A Windows CI runner. Browser discovery for Windows is unit-tested with mocks here; the matrix
  comes with `distribution`.
- Any code for a calculator-scoped token, whatever the investigation finds.

### Publish-gate impact

None. The gate (ADR-0003) does not exist yet, and its anonymous re-read and Edit check need no
session. This change only alters where the write path gets its cookies.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `huawei/auth-sessions`: the stored session and cURL import are removed; writes read the
  profile once per process; system-browser discovery, `AUTH_PROFILE_BUSY` and one-time cleanup
  of legacy sessions are added; silent refresh re-reads the profile instead of re-exporting.

## Impact

- Code: `src/autocalc/auth.py` (rewritten around the profile), `src/autocalc/share.py`
  (`Session` and `publish` lose the file and env sources), `src/autocalc/cli.py` (`login`,
  `logout`, `auth status`, `auth import` removed, `doctor`), `src/autocalc/server.py`
  (`auth_status`, `auth_login`), `src/autocalc/errors.py` (`AuthProfileBusy`).
- Tests: `tests/test_cli_auth.py` loses the cURL tests and gains offline tests for discovery,
  busy-profile mapping, redaction and cleanup, with a fake browser launcher.
- Docs: `docs/reference/cli.md`, `docs/reference/errors.md`,
  `docs/explanation/huawei/sessions.md`, `docs/tutorials/first-quote.md`, `docs/roadmap.md`,
  README security note.
- Dependencies: none added. `keyring` stays for cleanup only.
- Users: anyone who used `auth import` or `AUTOCALC_SESSION` runs `autocalc login` once.
