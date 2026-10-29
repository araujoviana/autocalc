---
status: accepted
date: 2026-10-16
---

# Auth: the persistent browser profile is the credential

## Context and Problem Statement

Saving a list needs a logged-in Huawei session. Today's design has these layers:
* a persistent browser profile (for login and silent refresh);
* plus cookies exported from it into the OS keyring or a 0600 file;
* plus a "Copy as cURL" import.

On 2026-10-16, `autocalc login` crashed on launch because the Playwright upgrade expected a
browser build that wasn't installed. `auth status` also showed the exported layer decaying
(no account mask).

## Considered Options

* Keep the three layers and fix the crash.
* **The profile is the credential.** Keep only the persistent profile, drive a system
  Chrome/Edge/Chromium when present, and give actionable login errors.
* An API key (AK/SK) flow. The calculator's save endpoints don't accept one.

## Decision Outcome

Chosen option: **the profile is the credential**:
* Writes take their cookies from the profile at call time.
* The cookie export, keyring and cURL-import layers are removed.
* The browser is found in this order: an explicit override, then system Chrome/Edge/Chromium,
  then Playwright's bundled build. A Playwright upgrade can then no longer break login.
* Login failures (`AUTH_LOGIN_FAILED`) say what to do next.

Users are a few technical colleagues, each on their own machine with their own login.

### Consequences

* Good, because there is one secret store, kept by the browser, and nothing to copy or leak.
* Good, because login keeps working across Playwright upgrades.
* Bad, because write calls must open the profile, which is slower than reading a file. Mitigated
  by keeping a session alive within a run.
* The spec delta (`huawei/auth-sessions`) ships with the code in the `auth-sessions` change.

### Amendment (2026-10-17)

Huawei's sign-on cookie is session-only, and Chromium did not reliably keep it when the profile
was reopened after login. So `autocalc login` also writes the cookie header to a file protected by POSIX mode 0600 or the inherited Windows user-profile ACL
inside the profile directory, and writes read it from there. The profile directory is still the
only credential store, `logout` still deletes it whole, and there is still no keyring copy.
Details: `auth-sessions` design D1.
