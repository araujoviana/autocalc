"""Offline tests for auth: browser discovery, the profile touchpoint, the cookie cache,
login/status/logout and the legacy cleanup. No browser is launched."""

from __future__ import annotations

import json
import os
import socket
import sys
import threading
from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from autocalc import auth
from autocalc.errors import CalculatorError

SECRET = "s3cr3t-value"
COOKIES = [{"name": "cbc-sid", "value": SECRET, "domain": ".huaweicloud.com"},
           {"name": "csrf", "value": "tok", "domain": "www.huaweicloud.com"},
           {"name": "other", "value": "x", "domain": ".example.com"}]


class FakeTime:
    """Clock that jumps 10 s per read, so probe loops end without waiting."""

    def __init__(self):
        self.now = 0.0

    def time(self):
        self.now += 10
        return self.now

    def sleep(self, _s):
        pass


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOCALC_CONFIG", str(tmp_path / "config"))
    monkeypatch.setenv("AUTOCALC_DATA", str(tmp_path / "data"))
    monkeypatch.delenv("AUTOCALC_PROFILE", raising=False)
    monkeypatch.delenv("AUTOCALC_BROWSER", raising=False)
    monkeypatch.setattr(auth, "_cache", {})
    monkeypatch.setattr(auth, "_cleanup_done", False)
    monkeypatch.setattr(auth, "time", FakeTime())
    monkeypatch.setattr(auth, "_header_valid", lambda _h: False)  # never touch the network


class FakeResponse:
    def __init__(self, payload):
        self.status = 200
        self._payload = payload

    def json(self):
        return self._payload


class FakeContext:
    def __init__(self, logged_in=True):
        self.logged_in = logged_in
        self.pages = []
        self.request = self
        self.closed = False

    def get(self, url, timeout=None):
        if url.endswith("share/list"):
            return FakeResponse({"retCode": "200" if self.logged_in else "CBC.0101"})
        return FakeResponse({"maskedName": "u***@example.com"})

    def new_page(self):
        return SimpleNamespace(goto=lambda *a, **k: None)

    def cookies(self):
        return COOKIES

    def close(self):
        self.closed = True


@pytest.fixture
def fake_profile(monkeypatch):
    """Replace ``_open_profile``; ``opens`` records each launch."""
    state = SimpleNamespace(opens=[], logged_in=True, delay=0.0)

    @contextmanager
    def fake_open(prof, headless=True, choice=None):
        state.opens.append((prof, headless))
        auth.profile_dir(prof).mkdir(parents=True, exist_ok=True)
        if state.delay:
            threading.Event().wait(state.delay)
        yield FakeContext(state.logged_in)

    monkeypatch.setattr(auth, "_open_profile", fake_open)
    return state


# ---- 1.1 find_browser ------------------------------------------------------------

NOTHING = {"which": lambda _c: None, "exists": lambda _p: False}


def test_browser_override_wins():
    env = {"AUTOCALC_BROWSER": "/opt/brave/brave", "PROGRAMFILES": r"C:\Program Files"}
    b = auth.find_browser("linux", env, which=lambda c: f"/usr/bin/{c}", exists=lambda _p: True)
    assert (b.name, b.executable) == ("override", "/opt/brave/brave")
    assert b.launch_kwargs() == {"executable_path": "/opt/brave/brave"}


def test_browser_windows_chrome():
    chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    b = auth.find_browser("win32", {"PROGRAMFILES": r"C:\Program Files"}, which=lambda _c: None,
                          exists=lambda p: p == chrome)
    assert (b.name, b.channel, b.executable) == ("chrome", "chrome", chrome)
    assert b.launch_kwargs() == {"channel": "chrome"}


def test_browser_windows_edge_only():
    edge = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    env = {"PROGRAMFILES": r"C:\Program Files", "PROGRAMFILES(X86)": r"C:\Program Files (x86)",
           "LOCALAPPDATA": r"C:\Users\u\AppData\Local"}
    b = auth.find_browser("win32", env, which=lambda _c: None, exists=lambda p: p == edge)
    assert (b.name, b.channel) == ("msedge", "msedge")


def test_browser_windows_chrome_per_user():
    chrome = r"C:\Users\u\AppData\Local\Google\Chrome\Application\chrome.exe"
    b = auth.find_browser("win32", {"LOCALAPPDATA": r"C:\Users\u\AppData\Local"}, which=lambda _c: None,
                          exists=lambda p: p == chrome)
    assert b.name == "chrome"


def test_browser_linux_chrome_before_chromium():
    paths = {"google-chrome-stable": "/usr/bin/google-chrome-stable", "chromium": "/usr/bin/chromium"}
    b = auth.find_browser("linux", {}, which=paths.get, exists=lambda _p: False)
    assert (b.name, b.executable, b.channel) == ("chrome", "/usr/bin/google-chrome-stable", None)


def test_browser_linux_chrome_fixed_path():
    b = auth.find_browser("linux", {}, which=lambda _c: None, exists=lambda p: p == "/opt/google/chrome/chrome")
    assert (b.name, b.executable) == ("chrome", "/opt/google/chrome/chrome")


def test_browser_linux_chromium_only():
    b = auth.find_browser("linux", {}, which={"chromium": "/usr/bin/chromium"}.get, exists=lambda _p: False)
    assert (b.name, b.executable) == ("chromium", "/usr/bin/chromium")


def test_browser_bundled_fallback():
    for platform in ("linux", "win32"):
        b = auth.find_browser(platform, {}, **NOTHING)
        assert b.name == "bundled" and b.launch_kwargs() == {}


# ---- 1.2 _open_profile ---------------------------------------------------------


class FakePlaywright:
    def __init__(self, launch):
        self.chromium = SimpleNamespace(launch_persistent_context=launch)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _raising_launch(*_a, **_k):
    raise RuntimeError("RAW PLAYWRIGHT TEXT: ProcessSingleton")


def _patch_playwright(monkeypatch, launch):
    import playwright.sync_api
    monkeypatch.setattr(playwright.sync_api, "sync_playwright", lambda: FakePlaywright(launch))


def _lock_profile(kind):
    udd = auth.profile_dir("default")
    udd.mkdir(parents=True)
    if kind == "SingletonLock":
        try:
            os.symlink("otherhost-12345", udd / "SingletonLock")  # dangling, as Chromium leaves it
        except (OSError, NotImplementedError):
            pytest.skip("symlinks unavailable")
    else:
        (udd / "lockfile").write_text("")


@pytest.mark.parametrize("kind", ["SingletonLock", "lockfile"])
def test_open_profile_busy(monkeypatch, kind):
    _patch_playwright(monkeypatch, _raising_launch)
    _lock_profile(kind)
    with pytest.raises(CalculatorError) as ei:
        with auth._open_profile("default", choice=auth.BrowserChoice("chromium", executable="/usr/bin/chromium")):
            pass
    assert ei.value.code == "AUTH_PROFILE_BUSY"
    assert "--profile" in str(ei.value)
    assert "RAW PLAYWRIGHT" not in str(ei.value) and "RAW PLAYWRIGHT" in str(ei.value.__cause__)


def test_open_profile_launch_failure(monkeypatch):
    _patch_playwright(monkeypatch, _raising_launch)
    with pytest.raises(CalculatorError) as ei:
        with auth._open_profile("default", choice=auth.BrowserChoice("chromium", executable="/usr/bin/chromium")):
            pass
    assert ei.value.code == "AUTH_LOGIN_FAILED"
    assert "chromium" in str(ei.value) and "AUTOCALC_BROWSER" in str(ei.value)
    assert "RAW PLAYWRIGHT" not in str(ei.value)


def test_open_profile_launch_kwargs_and_close(monkeypatch):
    seen = {}
    ctx = FakeContext()

    def launch(udd, **kw):
        seen.update(kw, udd=udd)
        return ctx

    _patch_playwright(monkeypatch, launch)
    with auth._open_profile("work", headless=True, choice=auth.BrowserChoice("chrome", channel="chrome")) as got:
        assert got is ctx and not ctx.closed
    assert ctx.closed
    assert seen["channel"] == "chrome" and seen["headless"] is True
    assert seen["udd"].endswith("browser-profile-work")
    prefs = json.loads((auth.profile_dir("work") / "Default" / "Preferences").read_text())
    assert prefs["session"]["restore_on_startup"] == 1


def test_keep_session_cookies_preserves_other_prefs(tmp_path):
    prefs = tmp_path / "Default" / "Preferences"
    prefs.parent.mkdir()
    prefs.write_text(json.dumps({"session": {"restore_on_startup": 5, "x": 1}, "other": True}))
    auth._keep_session_cookies(tmp_path)
    assert json.loads(prefs.read_text()) == {"session": {"restore_on_startup": 1, "x": 1}, "other": True}


def test_keep_session_cookies_replaces_corrupt_prefs(tmp_path):
    prefs = tmp_path / "Default" / "Preferences"
    prefs.parent.mkdir()
    prefs.write_text("{not json")
    auth._keep_session_cookies(tmp_path)
    assert json.loads(prefs.read_text()) == {"session": {"restore_on_startup": 1}}


class CountingContext(FakeContext):
    def __init__(self, logged_in_after_visit):
        super().__init__(logged_in=False)
        self.probes = 0
        self.visits = 0
        self.after_visit = logged_in_after_visit

    def get(self, url, timeout=None):
        if url.endswith("share/list"):
            self.probes += 1
        return super().get(url, timeout)

    def new_page(self):
        self.visits += 1
        self.logged_in = self.after_visit
        return super().new_page()


@pytest.mark.parametrize("after_visit", [True, False])
def test_read_profile_checks_without_polling(monkeypatch, after_visit):
    ctx = CountingContext(after_visit)

    @contextmanager
    def fake_open(prof, headless=True, choice=None):
        yield ctx

    monkeypatch.setattr(auth, "_open_profile", fake_open)
    read = auth._read_profile("default")
    assert (read is not None) is after_visit
    assert (ctx.probes, ctx.visits) == (2, 1)


# ---- 2.1 session_cookies -------------------------------------------------------


def test_session_cookies_cached_per_process(fake_profile):
    auth.profile_dir().mkdir(parents=True)
    first = auth.session_cookies()
    second = auth.session_cookies()
    assert first == second == f"cbc-sid={SECRET}; csrf=tok"
    assert len(fake_profile.opens) == 1 and fake_profile.opens[0] == ("default", True)


def test_session_cookies_refresh_reopens(fake_profile):
    auth.profile_dir().mkdir(parents=True)
    auth.session_cookies()
    auth.session_cookies(refresh=True)
    assert len(fake_profile.opens) == 2


def test_session_cookies_never_logged_in(fake_profile):
    with pytest.raises(CalculatorError) as ei:
        auth.session_cookies()
    assert ei.value.code == "AUTH_EXPIRED" and "autocalc login" in str(ei.value)
    assert fake_profile.opens == []
    assert not auth.profile_dir().exists()


def test_session_cookies_signed_out_profile(fake_profile):
    auth.profile_dir().mkdir(parents=True)
    fake_profile.logged_in = False
    with pytest.raises(CalculatorError) as ei:
        auth.session_cookies()
    assert ei.value.code == "AUTH_EXPIRED"
    assert auth._cache == {}


def test_session_cookies_threads_open_once(fake_profile):
    auth.profile_dir().mkdir(parents=True)
    fake_profile.delay = 0.2
    results = []
    threads = [threading.Thread(target=lambda: results.append(auth.session_cookies())) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(results) == 2 and len(set(results)) == 1
    assert len(fake_profile.opens) == 1


def _new_process(monkeypatch):
    monkeypatch.setattr(auth, "_cache", {})


def test_saved_session_survives_a_new_process(fake_profile, monkeypatch):
    auth.login(timeout=5)
    path = auth._session_path("default")
    assert path.parent == auth.profile_dir()
    if not sys.platform.startswith("win"):
        assert path.stat().st_mode & 0o777 == 0o600
    _new_process(monkeypatch)
    assert auth.session_cookies() == f"cbc-sid={SECRET}; csrf=tok"
    assert fake_profile.opens == [("default", False)]  # the login only; no headless reopen


def test_refresh_ignores_saved_session(fake_profile, monkeypatch):
    auth.login(timeout=5)
    _new_process(monkeypatch)
    auth.session_cookies(refresh=True)
    assert fake_profile.opens == [("default", False), ("default", True)]


def test_signed_out_profile_forgets_saved_session(fake_profile, monkeypatch):
    auth.login(timeout=5)
    fake_profile.logged_in = False
    with pytest.raises(CalculatorError) as ei:
        auth.session_cookies(refresh=True)
    assert ei.value.code == "AUTH_EXPIRED"
    assert not auth._session_path("default").exists()


def test_status_uses_saved_session_without_browser(fake_profile, monkeypatch):
    auth.login(timeout=5)
    monkeypatch.setattr(auth, "_header_valid", lambda h: SECRET in h)
    st = auth.status()
    assert st["logged_in"] is True and st["account_mask"] == "u***@example.com" and SECRET not in repr(st)
    assert fake_profile.opens == [("default", False)]


def test_status_falls_back_to_profile_when_saved_session_is_stale(fake_profile):
    auth.login(timeout=5)
    fake_profile.logged_in = False
    st = auth.status()
    assert st["logged_in"] is False
    assert not auth._session_path("default").exists()


# ---- 2.2 login / status / logout ----------------------------------------------


def _files_outside_profile(tmp_path):
    udd = auth.profile_dir()
    return {p for p in tmp_path.rglob("*") if p.is_file() and udd not in p.parents}


def test_login_stores_nothing_outside_profile(fake_profile, tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "find_browser", lambda: auth.BrowserChoice("chromium", executable="/usr/bin/chromium"))
    res = auth.login(timeout=5)
    assert res == auth.LoginResult(account_mask="u***@example.com", browser="chromium")
    assert fake_profile.opens == [("default", False)]
    outside = _files_outside_profile(tmp_path)
    assert outside <= {auth.data_dir() / auth._LEGACY_MARKER}
    assert not any(SECRET in p.read_text(errors="ignore") for p in outside)


def test_login_times_out(fake_profile):
    fake_profile.logged_in = False
    with pytest.raises(CalculatorError) as ei:
        auth.login(timeout=5)
    assert ei.value.code == "AUTH_LOGIN_FAILED" and "autocalc login" in str(ei.value)


def test_status_shows_names_not_values(fake_profile):
    auth.profile_dir().mkdir(parents=True)
    st = auth.status()
    assert st["logged_in"] is True and st["account_mask"] == "u***@example.com"
    assert "cbc-sid" in st["cookies"] and SECRET not in repr(st)
    assert "browser" in st


def test_status_without_profile_does_not_open(fake_profile):
    st = auth.status()
    assert st["logged_in"] is False and "autocalc login" in st["hint"]
    assert fake_profile.opens == []


def test_logout_removes_profile_dir(fake_profile):
    auth.profile_dir().mkdir(parents=True)
    (auth.profile_dir() / "Cookies").write_text("x")
    auth.session_cookies()
    removed = auth.logout()
    assert not auth.profile_dir().exists()
    assert str(auth.profile_dir()) in removed
    assert auth._cache == {}


@pytest.mark.skipif(sys.platform.startswith("win"), reason="POSIX lock symlink")
def test_logout_busy_when_profile_held():
    udd = auth.profile_dir()
    udd.mkdir(parents=True)
    os.symlink(f"{socket.gethostname()}-{os.getpid()}", udd / "SingletonLock")
    with pytest.raises(CalculatorError) as ei:
        auth.logout()
    assert ei.value.code == "AUTH_PROFILE_BUSY"
    assert udd.exists()


def test_logout_stale_lock_is_not_busy():
    udd = auth.profile_dir()
    udd.mkdir(parents=True)
    try:
        os.symlink("otherhost-1", udd / "SingletonLock")
    except (OSError, NotImplementedError):
        pytest.skip("symlinks unavailable")
    auth.logout()
    assert not udd.exists()


# ---- 2.3 legacy cleanup --------------------------------------------------------


def _legacy_setup():
    cfg = auth.config_dir()
    cfg.mkdir(parents=True)
    (cfg / "session.json").write_text(f'{{"cookie_header": "cbc-sid={SECRET}"}}')
    (cfg / "session-x.json").write_text("{}")


def test_cleanup_deletes_legacy_copies_once():
    _legacy_setup()
    assert auth._cleanup_legacy() == 2
    assert not list(auth.config_dir().glob("session*.json"))
    assert (auth.data_dir() / auth._LEGACY_MARKER).exists()

    # A new process (flag reset) sees the marker and leaves the files alone.
    auth._cleanup_done = False
    (auth.config_dir() / "session.json").write_text("{}")
    assert auth._cleanup_legacy() == 0
    assert (auth.config_dir() / "session.json").exists()


def test_cleanup_runs_from_session_cookies(fake_profile):
    _legacy_setup()
    auth.profile_dir().mkdir(parents=True)
    auth.session_cookies()
    assert not (auth.config_dir() / "session.json").exists()


def test_logout_cleans_even_after_marker():
    auth._cleanup_legacy()
    _legacy_setup()
    removed = auth.logout()
    assert not (auth.config_dir() / "session.json").exists()
    assert any("legacy" in r for r in removed)


def test_redaction_hides_values():
    red = auth.redact_cookie_header(f"cbc-sid={SECRET}; HWS_INTL_ID=other")
    assert SECRET not in red and "2 cookies" in red



# ---- 3.3 MCP tools ---------------------------------------------------------------


def test_mcp_auth_tools(fake_profile):
    from autocalc import tools as server

    out = server.auth_login()
    assert out["logged_in"] is True and out["account_mask"] == "u***@example.com" and "browser" in out
    st = server.auth_status()
    assert st["logged_in"] is True and SECRET not in repr(st)


def test_mcp_auth_status_busy_is_structured(monkeypatch):
    @contextmanager
    def busy(prof, headless=True, choice=None):
        raise auth.AuthProfileBusy()
        yield

    from autocalc import tools as server

    auth.profile_dir().mkdir(parents=True)
    monkeypatch.setattr(auth, "_open_profile", busy)
    out = server.auth_status()
    assert out["error"] == "AUTH_PROFILE_BUSY" and "--profile" in out["hint"]


def test_a_profile_given_as_a_path_is_refused_with_a_hint(monkeypatch):
    import pytest

    from autocalc import auth
    from autocalc.errors import ValidationError
    monkeypatch.setenv("AUTOCALC_PROFILE", "/tmp/some/dir")
    with pytest.raises(ValidationError) as ei:
        auth.profile_dir()
    assert "not a path" in ei.value.hint
    monkeypatch.setenv("AUTOCALC_PROFILE", "work")
    assert auth.profile_dir().name == "browser-profile-work"
