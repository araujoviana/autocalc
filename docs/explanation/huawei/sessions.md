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

The direction for auth is that the browser profile itself is the credential
([ADR-0011](../../adr/0011-auth-browser-profile-is-the-credential.md)).
