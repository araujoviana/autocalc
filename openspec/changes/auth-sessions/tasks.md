# Tasks

## 1. Browser discovery and the profile touchpoint

- [ ] 1.1 Add `find_browser()` → `BrowserChoice(name, channel, executable)` per design D2, with injectable `platform`/`environ`/`which`/`exists`; delete `browser_executable()`. Verify with offline tests in `tests/test_auth.py` covering override, Windows Chrome, Windows Edge-only, Linux Chrome, Linux Chromium-only and bundled fallback
- [ ] 1.2 Add `_open_profile(prof, headless)` per D3 (launch via channel or executable_path, always close, map a launch failure with a lock artifact to `AUTH_PROFILE_BUSY` and any other to `AUTH_LOGIN_FAILED` naming the browser); add `AuthProfileBusy` to `errors.py`. Verify with offline tests that monkeypatch the Playwright launcher to raise, with and without a `SingletonLock`/`lockfile` in a tmp profile dir, and assert the error code and that the raw message is absent from `str(exc)`

## 2. Session from the profile

- [ ] 2.1 Implement `session_cookies(prof, refresh)` with the locked per-profile cache (D1) and the no-profile-dir `AUTH_EXPIRED` short-circuit. Verify with offline tests using a fake context: two calls → one open; `refresh=True` → second open; missing dir → `AUTH_EXPIRED` and zero opens; two threads → one open
- [ ] 2.2 Rewrite `login`, `status` and `logout` per D4/D6 on top of `_open_profile`; remove `Session`, `SessionStore`, `parse_curl`, `import_from_clipboard`, `migrate_session_curl`, `refresh`, `CORE_COOKIES`. Verify with offline tests: `login` writes no file outside the profile dir (scan tmp `AUTOCALC_CONFIG`/`AUTOCALC_DATA`), `status` output contains cookie names but no values, `logout` removes the profile dir
- [ ] 2.3 Implement `_cleanup_legacy()` with the marker (D5), called from `session_cookies`, `status`, `login`, and unconditionally from `logout`. Verify with offline tests using a fake keyring module: first call deletes `session.json`, `session-x.json` and the `session:default`/`session:x` entries and writes the marker; second call touches neither the keyring nor the files; a keyring that raises does not break the call

## 3. Callers

- [ ] 3.1 `share.Session`: drop the cURL-file, `AUTOCALC_SESSION` and `.session.curl` sources, take cookies from `auth.session_cookies()` unless `cookie_header` is given, and make `_renew` use `refresh=True`; drop `publish(session_file=...)` and `DEFAULT_SESSION`. Verify with an offline test using `httpx.MockTransport`: a first `CBC.0101` triggers exactly one refresh and the retry succeeds; a second `CBC.0101` raises `AUTH_EXPIRED`; the `csrf` cookie is sent as a header
- [ ] 3.2 CLI: update `login`, `logout` and `auth status` output per D7, remove `auth import` and its usage line, and change `doctor` to report the browser choice and whether the profile dir exists. Verify with `uv run autocalc --help`, `uv run autocalc auth --help` (no `import`) and `uv run autocalc doctor` output on this machine
- [ ] 3.3 MCP: update `auth_status` / `auth_login` to the new return shapes, keeping the tool names. Verify with an offline test calling both tool functions with `_open_profile` faked
- [ ] 3.4 Keep `.session.curl` in `.gitignore` (an old copy may still sit in a checkout) and delete the cURL tests from `tests/test_cli_auth.py`. Verify with `grep -rn "session.curl\|AUTOCALC_SESSION\|parse_curl\|SessionStore" src tests` → no hits

## 4. Docs and roadmap

- [ ] 4.1 Update `docs/reference/cli.md` (no `auth import`; logout semantics), `docs/reference/errors.md` (`AUTH_PROFILE_BUSY`), `docs/explanation/huawei/sessions.md` (profile is the credential, discovery order, busy profile, legacy cleanup), `docs/tutorials/first-quote.md` and the README security note. Verify with `uv run --group docs mkdocs build --strict` and `grep -rn "auth import\|keyring" docs README.md` → only the cleanup mention
- [ ] 4.2 Add a roadmap row "Drop the `keyring` dependency once the legacy cleanup has run" assigned to `distribution`. Verify by reading `docs/roadmap.md`

## 5. cpqjwt investigation (time-boxed, read-only)

- [ ] 5.1 Within one hour, answer D9's four questions from the fetched bundle with the RE tooling; send no logged-in request. Write the findings to a "Calculator-scoped token" section in `docs/explanation/huawei/sessions.md` (generic, no account data), and remove or replace the roadmap row. Verify the strict docs build passes and the roadmap no longer has the open-ended row

## 6. Verification

- [ ] 6.1 Run `uv run ruff check`, `uv run pytest -m "not live"`, `uv run --group docs mkdocs build --strict` and `openspec validate auth-sessions --strict`; all pass
- [ ] 6.2 Live check on Linux, run by the user because login is interactive: `autocalc logout`, then `autocalc login` (browser reported), `autocalc auth status` (logged in, cookie names only), `autocalc lists` (one profile open), then run `autocalc lists` while a login window is open (`AUTH_PROFILE_BUSY`). Record the outcomes in this task line
- [ ] 6.3 Confirm no cookie value exists outside the profile after 6.2: `grep -rl` for a cookie value taken from the profile (done locally, value not printed) over `~/.config/autocalc` and `~/.local/share/autocalc` excluding the profile dir → no hits, and `keyring get autocalc session:default` → empty

## Workflow follow-up

- Archive with `/opsx:archive auth-sessions`.
- Next change: `spa-encoder-poc`.
