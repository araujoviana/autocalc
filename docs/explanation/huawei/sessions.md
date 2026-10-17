# Sessions

*Specs: `huawei/auth-sessions`*

## What needs a session

Only the endpoints that read or write the user's account need a session: `share/add`,
`share/list`, `share/update`, `share/delete`, `share/copy` and `formExport`. Catalog, rating
and `share/detail` (reading any list by its id) are anonymous.

## Which cookie authenticates (observed 2026-10-13)

Bisecting the cookie jar against `share/list` and `share/add` showed:

- **`HWS_INTL_ID` alone authenticates.** Every subset without it returned `CBC.0101`.
- `cbc-sid` alone does **not**. The calculator session is short-lived, while `HWS_INTL_ID` is
  the single-sign-on cookie that outlives it. That is what makes a silent refresh from the
  browser profile work.
- A `csrf` cookie, when present, is also sent as a `csrf` header.

This is an observation about Huawei's backend, not a promise. autocalc sends the full jar
rather than depending on the minimal set.

## Treat the session like a password

The session grants access to the Huawei Cloud **account**, not just the calculator.
- Cookie values are never logged; errors and `auth status` show cookie *names* only.
- Never commit session files, the browser profile or the golden corpus. They are gitignored.
- Keep client-related scripts and notes outside the repository.

## The browser profile is the credential

The browser profile is the only place the session lives
([ADR-0011](../../adr/0011-auth-browser-profile-is-the-credential.md)). Nothing is copied to a
file or the keyring.

- **Login.** `autocalc login` opens a visible browser on a persistent profile directory
  (`~/.local/share/autocalc/browser-profile`, or `browser-profile-<name>` for `--profile`).
  You sign in by hand, which covers MFA, captcha and SSO.
- **Writes.** The first write in a process opens the profile headless, reads the
  huaweicloud cookies into memory and closes the browser. Later writes in the same process
  reuse them. The browser is not kept open, so the profile is never locked for longer than
  that read, even while an MCP server runs.
- **Refresh.** When a write returns `CBC.0101`, autocalc re-reads the profile once and
  retries. Loading the calculator page in the profile lets the single-sign-on cookie renew the
  calculator session. Only if that fails does the call return `AUTH_EXPIRED`.
- **Logout.** `autocalc logout` deletes the profile directory. That signs out for certain
  without driving Huawei's sign-out page.

### Which browser

Login and the headless reads use, in order: `AUTOCALC_BROWSER`, an installed Google Chrome,
Microsoft Edge, a `chromium` on `PATH`, then Playwright's bundled build. On Windows, Chrome and
Edge are found under Program Files and the per-user AppData folder. A system browser keeps
working across Playwright upgrades; the bundled build may not be installed after one. `autocalc
doctor` and `autocalc auth status` show which browser was chosen.

### Busy profile

Chromium lets one process use a profile directory at a time. If a login window or another
autocalc process has it open, the call fails with `AUTH_PROFILE_BUSY` instead of a raw browser
error. Close the other window, or use another profile with `--profile`.

### Sessions from earlier versions

Earlier versions copied the cookies into the OS keyring (service `autocalc`) or a
`session*.json` file in `~/.config/autocalc`, and could import a "Copy as cURL". The first
auth command after upgrading deletes those copies once, and `autocalc logout` deletes them
again. The `keyring` dependency remains only for this cleanup.

## Calculator-scoped token (`cpqjwt`, checked 2026-10-17)

The calculator bundle (frontend 11.4.201) mentions a `cpqjwt` token. A read-only look at the
bundle, with no logged-in request, answered whether it could replace the account session for
writes. It cannot.

| Question | Finding |
|---|---|
| What issues it? | Not the calculator. A CPQ (configure-price-quote) sales system opens the calculator with `?cpqjwt=…` alongside a quote id and a return URL. The page moves the token into `sessionStorage` (`calculator_cpq`) and scrubs it from the address bar. |
| What is it scoped to? | One endpoint: `POST …/v4/api/quoting_item`, which pushes the cart into that existing sales quote (`userId: "CALCULATOR"`, the quote id, items in chunks of 500). It also switches the page to a CPQ mode that hides beta products. |
| Do `share/*` accept it? | The frontend never sends it there. The request interceptor adds only the `csrf` header, and `share/*` rely on the account cookies. Nothing suggests the backend would accept it. |
| How long does it live? | Opaque to the client. Expiry shows up as `CBC.0100` with `jwtToken` in the message, which the page reports as a timeout. It lasts at most as long as the browser tab. |

Outcome: a dead end. The token comes only from a sales quote opened from outside, and it covers
pushing items into that quote, not saved lists. Writes keep using the browser profile.
