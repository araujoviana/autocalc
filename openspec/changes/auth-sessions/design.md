# Design

## Context

- `src/autocalc/auth.py` (332 lines) has three session sources: the persistent profile
  (`login`, `refresh`), a `SessionStore` (keyring, else a 0600 `session*.json`), and a cURL
  import (`parse_curl`, `import_from_clipboard`, `migrate_session_curl`).
- `share.Session` (`src/autocalc/share.py:253`) builds its cookie header from, in order: an
  explicit header, an `AUTOCALC_SESSION` cURL file, the repo `.session.curl`, then
  `SessionStore`. On `CBC.0101` it calls `auth.refresh()` and retries once.
- `Session()` is constructed per call: four times in `server.py`, and once each in `cli.py`,
  `tests/support/render.py` and `tests/support/pull_corpus.py`. So "once per process" cannot
  live on the instance.
- `browser_executable()` only searches Linux names on `PATH`, Chromium first. Chrome and Edge on
  Windows are not on `PATH`, so Windows users silently get Playwright's bundled build, which is
  exactly what broke on 2026-10-16.
- Chromium allows one process per profile directory. A second launch fails, or hands off to the
  running instance and exits, which Playwright reports as a closed-target error.
- Paths stay `~/.config/autocalc` and `~/.local/share/autocalc` (overridable with
  `AUTOCALC_CONFIG` / `AUTOCALC_DATA`). They work on Windows too; moving them is `distribution`.

## Goals / Non-Goals

**Goals:**
- One place that touches Playwright for auth, so offline tests can replace it with a fake.
- No cookie value on disk outside the browser profile, and none in any output.
- The same discovery order and error codes on Windows and Linux.

**Non-Goals:**
- Making read paths (catalog, rating, `share/detail`) aware of auth. They stay anonymous.
- Parallel writes. ADR-0010 keeps account writes sequential.
- Relocating paths, dropping `keyring`, or a Windows CI runner (see proposal).

## Decisions

### D1. Cache the cookies, not the browser
The first write in a process opens the profile headless, checks it against `share/list`, reads
the huaweicloud cookies into a module-level cache keyed by profile, and closes the browser. Later
`Session()` objects in the same process use the cache. `CBC.0101` clears that profile's cache
entry and re-reads once (`refresh=True`).

Alternatives considered:
- Keep the persistent context open for the life of the process. That holds the profile lock for
  as long as the MCP server runs, so `autocalc login` or any CLI write would always get
  `AUTH_PROFILE_BUSY` while the agent is connected. It also needs Playwright's sync API on one
  thread across MCP calls.
- Send writes through the browser's own request context. Same lock problem, and no gain: the
  cookie header is what the endpoints check.

The cache is a dict guarded by a `threading.Lock`, so two concurrent MCP tool calls open the
profile once, not twice.

### D2. Browser discovery returns a launch spec, resolved without launching
`find_browser()` returns `BrowserChoice(name, channel, executable)`, where `name` is one of
`override`, `chrome`, `msedge`, `chromium` or `bundled`. It checks file locations and never
launches anything:

| Step | Windows | Linux |
|---|---|---|
| override | `AUTOCALC_BROWSER` (path) | same |
| chrome | `chrome.exe` under `%PROGRAMFILES%`, `%PROGRAMFILES(X86)%`, `%LOCALAPPDATA%` `\Google\Chrome\Application\` | `google-chrome-stable` / `google-chrome` on `PATH`, or `/opt/google/chrome/chrome` |
| msedge | `msedge.exe` under the same roots `\Microsoft\Edge\Application\` | `microsoft-edge-stable` / `microsoft-edge` on `PATH`, or `/opt/microsoft/msedge/msedge` |
| chromium | `chromium` / `chromium-browser` on `PATH` | same |
| bundled | Playwright's build | same |

On Windows, Chrome and Edge launch through Playwright `channel=` (Playwright knows their paths
and flags). On Linux they launch with `executable_path=`, because `channel="chrome"` only looks at
`/opt/google/chrome/chrome` and a Chrome found on `PATH` may live elsewhere. The override and
Chromium always use `executable_path=`. The function takes `platform`, `environ`,
`which` and `exists` parameters with real defaults, so tests can cover both OSes on Linux CI.

This reverses the current Linux order (Chromium before Chrome). On a machine with both, a
profile created by Chromium would then open in Chrome. Both read the same profile format, and
`AUTOCALC_BROWSER` pins the old behavior. Spec order follows ADR-0011.

### D3. One Playwright touchpoint: `_open_profile(prof, headless)`
A context manager that resolves the browser (D2), launches the persistent context and always
closes it. `login`, `session_cookies`, `status` and `logout` all use it. Tests monkeypatch it
with a fake context that has `cookies()`, `request.get()` and `pages`.

Busy-profile mapping happens here. On a launch error, if the profile's lock artifact exists
(`SingletonLock` on Linux, `lockfile` on Windows) the error becomes `AUTH_PROFILE_BUSY`. Any
other launch error becomes `AUTH_LOGIN_FAILED`, naming the chosen browser and the override
variable. The raw Playwright message stays on `__cause__`, never in the user-facing text.

Alternative: check the lock before launching. A crash leaves a stale `SingletonLock` behind,
which Chromium clears on its own launch, so a pre-check would report busy for a free profile.
Mapping after a failed launch avoids that.

### D4. Public surface of `auth.py` after the change
- `find_browser()`, `profile()`, `profile_dir()`, `config_dir()`, `data_dir()`: unchanged
  meaning, except discovery per D2.
- `login(prof, timeout)` → `LoginResult(account_mask, browser)`. Nothing is stored.
- `session_cookies(prof=None, refresh=False) -> str`: the cookie header from the cache or the
  profile (D1). Without a profile directory it raises `AUTH_EXPIRED` without launching.
- `logout(prof)`: deletes the profile directory and that profile's cache entry, then runs the
  legacy cleanup (D5) unconditionally. If the profile is held by a live process it raises
  `AUTH_PROFILE_BUSY` before deleting anything: on Linux the `SingletonLock` symlink names
  `host-pid` and the pid is checked; on Windows a delete that fails on a held file maps to the
  same error. A stale lock from a crash does not block logout.
- `status(prof)`: `{logged_in, profile, browser, account_mask?, cookies?, hint?}`, where
  `cookies` is redacted (names and count). It opens the profile, so it can report busy.
- `redact_cookie_header()`: kept.

Removed: `Session` (the dataclass), `SessionStore`, `parse_curl`, `import_from_clipboard`,
`migrate_session_curl`, `refresh`, `browser_executable`, `KEYRING_SERVICE` (moves into the
cleanup), `CORE_COOKIES` (unused).

`share.Session(cookie_header=None)` keeps the explicit-header parameter for tests and otherwise
calls `auth.session_cookies()`. `_renew` calls `auth.session_cookies(refresh=True)`.
`publish()` loses `session_file`. `DEFAULT_SESSION` and `AUTOCALC_SESSION` go away.

### D5. Legacy cleanup runs once, behind a marker
`_cleanup_legacy()` runs at the start of `session_cookies`, `status`, `login` and `logout`.
It deletes:
- `config_dir()/session.json` and `session-*.json`;
- the keyring entries `autocalc` / `session:<name>` for `default`, for each name seen in those
  files, and for each `browser-profile-<name>` directory.

Then it writes `data_dir()/.legacy-sessions-cleaned`. While the marker exists, it returns
immediately, so the keyring (which can trigger an unlock prompt on Linux) is touched once per
machine. `logout` runs it regardless of the marker. Every keyring error is swallowed. The
cleanup must never block auth. `keyring` stays a dependency only for this, and a roadmap row
tracks removing it in `distribution`.

### D6. Logout deletes the profile directory
`autocalc logout` removes `profile_dir(prof)` entirely. That signs out with certainty, without
driving Huawei's sign-out page. Alternative: clear the cookies through Playwright. That leaves
the SSO state stored by other site data, and it still needs a launch.

### D7. CLI, MCP and doctor
- `autocalc login` prints `Logged in as <mask> ✓ (browser: <name>)`. `autocalc logout` prints
  what it deleted. `autocalc auth status` prints `status()`. `auth import` is removed, and the
  argparse subparser keeps only `status`.
- MCP `auth_status` and `auth_login` return the new dicts. Tool names and descriptions keep their
  meaning, so `mcp-surface` doesn't change.
- `doctor` replaces the "playwright chromium" line with `browser: <name> <path or channel>` and
  reports whether the profile directory exists. It does not open the profile, so it stays fast
  and never reports busy. A live check is `auth status`.

### D8. Errors
`AuthProfileBusy(AuthRequired)` with code `AUTH_PROFILE_BUSY`. Its hint reads: "Close the other
autocalc window or process using this profile, or pass --profile NAME." It is added to
`docs/reference/errors.md`.

### D9. The `cpqjwt` investigation is read-only and capped at one hour
- Inputs: the fetched frontend bundle (`scripts/fetch_bundle.py`) and the RE tooling, per the
  project's practice for calculator internals.
- Questions:
  - What issues the token?
  - What is it scoped to?
  - Do the `share/*` endpoints accept it in place of the account cookies?
  - How long does it live?
- Anything requiring a logged-in request is listed as a follow-up and not run, since it touches
  the user's account.
- Output: a "Calculator-scoped token" section in `explanation/huawei/sessions.md`, plus either
  the roadmap row removed (dead end) or replaced by a concrete row assigned to a change.

## Risks / Trade-offs

- [Opening the profile costs seconds on the first write] → Once per process (D1). The MCP server
  pays it once per session, and `auth status` pays it on every call, which is what the user asked
  for.
- [The profile is busy while a login window is open] → `AUTH_PROFILE_BUSY` with a hint, rather
  than a hang or a raw stack trace.
- [The lock artifact differs by Chromium version] → The mapping checks both names. An unmapped
  case degrades to `AUTH_LOGIN_FAILED`, which is still actionable. Verified live on Linux; the
  Windows case relies on the same code path and is verified when the Windows runner arrives.
- [Users of `auth import` lose a path] → **BREAKING** note in the proposal, and the hint on
  `AUTH_EXPIRED` already says `autocalc login`.
- [The cleanup deletes a session another tool wrote under service `autocalc`] → The service name
  is this project's own, and keys are `session:<name>` only.
