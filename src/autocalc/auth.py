"""Authentication for the calculator's *write* endpoints (share/add, share/list...).

The browser profile directory is the only credential store (ADR-0011):
  * ``login`` opens a headed system browser on a persistent profile; the user signs in by hand,
    and the huaweicloud cookie header is written to ``autocalc-session`` (0600) inside that
    profile directory. Huawei's sign-on cookie is session-only, and Chromium does not reliably
    keep it across a relaunch, so the browser's own cookie store alone cannot carry the sign-in.
  * Writes use that file, cached in memory per process (``session_cookies``). Nothing is copied
    outside the profile directory; ``logout`` deletes the whole directory.
  * A stale session (``CBC.0101``) re-reads the profile once before ``AUTH_EXPIRED``.

Only ``share/*`` (save, list, update, delete, copy) and ``formExport`` need this.
Catalog, rating and anonymous ``share/detail`` do not.
"""

from __future__ import annotations

import json
import ntpath
import os
import re
import shutil
import socket
import sys
import threading
import time
from collections.abc import Callable, Generator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from autocalc.client import CALC
from autocalc.errors import AuthExpired, AuthLoginFailed, AuthProfileBusy, ValidationError

CALCULATOR_URL = "https://www.huaweicloud.com/intl/en-us/pricing/calculator.html"
LOGIN_HINT = "Run `autocalc login` to sign in once in a browser window."
_LAUNCH_ARGS = ["--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage"]
# Chromium's single-instance lock: a symlink on Linux/macOS, a file on Windows.
_LOCK_ARTIFACTS = ("SingletonLock", "lockfile")
_LEGACY_MARKER = ".legacy-sessions-cleaned"
_SESSION_FILE = "autocalc-session"


def config_dir() -> Path:
    return Path(os.environ.get("AUTOCALC_CONFIG", Path.home() / ".config" / "autocalc"))


def data_dir() -> Path:
    return Path(os.environ.get("AUTOCALC_DATA", Path.home() / ".local" / "share" / "autocalc"))


def profile() -> str:
    return os.environ.get("AUTOCALC_PROFILE", "default")


def profile_dir(name: str | None = None) -> Path:
    name = name or profile()
    if not re.fullmatch(r"[\w.-]+", name):
        raise ValidationError(f"Profile name {name!r} is not a plain name.", field="profile",
                              hint="AUTOCALC_PROFILE and --profile take a name like `work`, not a path.")
    p = data_dir() / "browser-profile"
    return p if name == "default" else p.with_name(f"browser-profile-{name}")


# ---- browser discovery (D2) ---------------------------------------------------


@dataclass(frozen=True)
class BrowserChoice:
    """How to launch the browser: a Playwright ``channel``, an ``executable`` path, or neither (bundled)."""

    name: str  # override | chrome | msedge | chromium | bundled
    channel: str | None = None
    executable: str | None = None

    def launch_kwargs(self) -> dict[str, str]:
        if self.channel:
            return {"channel": self.channel}
        if self.executable:
            return {"executable_path": self.executable}
        return {}

    def describe(self) -> str:
        where = self.executable or (f"channel {self.channel}" if self.channel else "playwright build")
        return f"{self.name} ({where})"


_WIN_APPS = {"chrome": ("Google", "Chrome", "Application", "chrome.exe"),
             "msedge": ("Microsoft", "Edge", "Application", "msedge.exe")}
_LINUX_APPS = {"chrome": (("google-chrome-stable", "google-chrome"), "/opt/google/chrome/chrome"),
               "msedge": (("microsoft-edge-stable", "microsoft-edge"), "/opt/microsoft/msedge/msedge")}


def find_browser(platform: str | None = None, environ: Mapping[str, str] | None = None,
                 which: Callable[[str], str | None] = shutil.which,
                 exists: Callable[[str], bool] = os.path.exists) -> BrowserChoice:
    """Pick the browser without launching it: override, Chrome, Edge, Chromium on PATH, bundled.

    Windows launches Chrome/Edge through Playwright channels (they live in the paths Playwright
    knows). Linux launches the found executable, since a PATH entry need not be the channel path.
    """
    platform = platform or sys.platform
    env = os.environ if environ is None else environ
    if override := env.get("AUTOCALC_BROWSER"):
        return BrowserChoice("override", executable=override)
    if platform.startswith("win"):
        roots = [r for r in (env.get("PROGRAMFILES"), env.get("PROGRAMFILES(X86)"), env.get("LOCALAPPDATA")) if r]
        for name, parts in _WIN_APPS.items():
            for root in roots:
                path = ntpath.join(root, *parts)
                if exists(path):
                    return BrowserChoice(name, channel=name, executable=path)
    else:
        for name, (commands, fixed) in _LINUX_APPS.items():
            path = next((p for c in commands if (p := which(c))), None) or (fixed if exists(fixed) else None)
            if path:
                return BrowserChoice(name, executable=path)
    for command in ("chromium", "chromium-browser"):
        if path := which(command):
            return BrowserChoice("chromium", executable=path)
    return BrowserChoice("bundled")


# ---- the one Playwright touchpoint (D3) -----------------------------------------


def _has_lock(udd: Path) -> bool:
    return any(os.path.lexists(udd / name) for name in _LOCK_ARTIFACTS)


def _launch_error(udd: Path, choice: BrowserChoice) -> AuthLoginFailed | AuthProfileBusy:
    if _has_lock(udd):
        return AuthProfileBusy(f"The browser profile {udd} is in use by another process.")
    return AuthLoginFailed(
        f"Could not start the browser {choice.describe()}.",
        hint="Install Google Chrome or Microsoft Edge, or set AUTOCALC_BROWSER to a Chromium-based browser.",
    )


def _keep_session_cookies(udd: Path) -> None:
    """Set "continue where you left off", the only mode in which Chromium keeps session cookies
    across a restart. Huawei's sign-on cookie ``HWS_INTL_ID`` is a session cookie (observed
    2026-10-17), so without this the profile is signed out every time it reopens."""
    prefs = udd / "Default" / "Preferences"
    try:
        data = json.loads(prefs.read_text(encoding="utf-8")) if prefs.exists() else {}
    except (OSError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    session = data.setdefault("session", {})
    if not isinstance(session, dict) or session.get("restore_on_startup") == 1:
        return
    session["restore_on_startup"] = 1
    try:
        prefs.parent.mkdir(parents=True, exist_ok=True)
        prefs.write_text(json.dumps(data), encoding="utf-8")
    except OSError:
        pass


@contextmanager
def _open_profile(prof: str, headless: bool = True, choice: BrowserChoice | None = None) -> Generator[Any]:
    """Launch the persistent profile and always close it. Launch errors never leak raw text."""
    from playwright.sync_api import sync_playwright

    udd = profile_dir(prof)
    udd.mkdir(parents=True, exist_ok=True)
    _keep_session_cookies(udd)
    choice = choice or find_browser()
    with sync_playwright() as p:
        try:
            ctx = p.chromium.launch_persistent_context(
                str(udd), headless=headless, args=_LAUNCH_ARGS,
                viewport={"width": 1366, "height": 900}, **choice.launch_kwargs())
        except Exception as exc:
            raise _launch_error(udd, choice) from exc
        try:
            yield ctx
        finally:
            try:
                ctx.close()
            except Exception:
                pass


# ---- redaction --------------------------------------------------------------


def redact_cookie_header(header: str) -> str:
    parts = [p.strip() for p in (header or "").split(";") if p.strip()]
    names = [p.split("=", 1)[0] for p in parts]
    return f"{len(names)} cookies ({', '.join(names[:6])}{'...' if len(names) > 6 else ''})"


# ---- reading the profile ------------------------------------------------------


def _cookie_header(cookies: Any) -> str:
    seen: dict[str, str] = {}
    for c in cookies:
        if c.get("domain", "").lstrip(".").endswith("huaweicloud.com"):
            seen[c["name"]] = c["value"]
    return "; ".join(f"{k}={v}" for k, v in seen.items())


def _probe_login(ctx: Any, timeout: float) -> bool:
    """Poll share/list; 200 means logged in, CBC.0101 means not yet."""
    deadline = time.time() + timeout
    url = f"{CALC}/share/list"
    while True:
        try:
            r = ctx.request.get(url, timeout=15000)
            if r.status == 200 and str(r.json().get("retCode")) == "200":
                return True
        except Exception:
            pass
        if time.time() >= deadline:
            return False
        time.sleep(2)


def _visit(ctx: Any, timeout_ms: int) -> None:
    """Load the calculator so the SSO renews its session cookies."""
    try:
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(CALCULATOR_URL, wait_until="domcontentloaded", timeout=timeout_ms)
    except Exception:
        pass


def _mask(ctx: Any) -> str | None:
    """Best-effort account mask; returns None when not exposed."""
    try:
        r = ctx.request.get("https://www.huaweicloud.com/intl/en-us/pricing/index/islogin", timeout=8000)
        if r.status == 200:
            j = r.json()
            for k in ("maskedName", "accountName", "userName", "masked_user"):
                if j.get(k):
                    return str(j[k])
    except Exception:
        pass
    return None


def _read_profile(prof: str) -> tuple[str, str | None] | None:
    """Open the profile headless; return (cookie header, account mask), or None if signed out.

    Nobody is signing in here, so there is nothing to poll for: one check, and one more after
    loading the calculator page (which lets the sign-on renew the calculator session)."""
    with _open_profile(prof, headless=True) as ctx:
        if not _probe_login(ctx, 0):
            _visit(ctx, 30000)
            if not _probe_login(ctx, 0):
                return None
        header = _cookie_header(ctx.cookies())
        return (header, _mask(ctx)) if header else None


def _session_path(prof: str) -> Path:
    return profile_dir(prof) / _SESSION_FILE


def _save_session(prof: str, header: str, mask: str | None) -> None:
    """Write the cookie header inside the profile directory, readable by the owner only."""
    path = _session_path(prof)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump({"cookie": header, "account_mask": mask}, f)


def _load_session(prof: str) -> tuple[str, str | None] | None:
    try:
        data = json.loads(_session_path(prof).read_text(encoding="utf-8"))
        return (data["cookie"], data.get("account_mask")) if data.get("cookie") else None
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None


def _forget_session(prof: str) -> None:
    try:
        _session_path(prof).unlink()
    except OSError:
        pass


def _header_valid(header: str) -> bool:
    """One share/list call with the saved header: no browser, a second or less."""
    import httpx

    headers = {"Cookie": header}
    for part in header.split(";"):
        k, _, v = part.strip().partition("=")
        if k == "csrf":
            headers["csrf"] = v
    try:
        r = httpx.get(f"{CALC}/share/list", headers=headers, timeout=15)
        return r.status_code == 200 and str(r.json().get("retCode")) == "200"
    except Exception:
        return False


# Per-process cookie cache (D1): the browser is closed, the profile stays unlocked.
_cache: dict[str, str] = {}
_cache_lock = threading.Lock()


def session_cookies(prof: str | None = None, refresh: bool = False) -> str:
    """Cookie header for write calls: the saved session, else the profile; once per process."""
    prof = prof or profile()
    _cleanup_legacy()
    with _cache_lock:
        if not refresh and prof in _cache:
            return _cache[prof]
        _cache.pop(prof, None)
        if not profile_dir(prof).exists():
            raise AuthExpired("Not logged in: there is no browser profile yet.", hint=LOGIN_HINT)
        saved = None if refresh else _load_session(prof)
        if saved is None:
            saved = _read_profile(prof)
            if saved is None:
                _forget_session(prof)
                raise AuthExpired("The browser profile is no longer signed in.", hint=LOGIN_HINT)
            _save_session(prof, *saved)
        _cache[prof] = saved[0]
        return saved[0]


# ---- login / status / logout (D4, D6) -------------------------------------------


@dataclass(frozen=True)
class LoginResult:
    account_mask: str | None
    browser: str


def login(prof: str | None = None, timeout: float = 300) -> LoginResult:
    """Open a headed browser on the calculator, wait for the user to sign in, save the session."""
    prof = prof or profile()
    _cleanup_legacy()
    choice = find_browser()
    with _open_profile(prof, headless=False, choice=choice) as ctx:
        _visit(ctx, 60000)
        if not _probe_login(ctx, timeout):
            raise AuthLoginFailed("Timed out waiting for login.",
                                  hint="Run `autocalc login` again and finish signing in within 5 minutes.")
        header = _cookie_header(ctx.cookies())
        if not header:
            raise AuthLoginFailed("Logged in, but the profile holds no huaweicloud cookies.", hint=LOGIN_HINT)
        mask = _mask(ctx)
    _save_session(prof, header, mask)
    with _cache_lock:
        _cache[prof] = header
    return LoginResult(account_mask=mask, browser=choice.name)


def status(prof: str | None = None) -> dict[str, Any]:
    """Check the session live: the saved header first, else the profile (headless).
    Shows cookie names only, never values."""
    prof = prof or profile()
    _cleanup_legacy()
    out: dict[str, Any] = {"logged_in": False, "profile": prof, "browser": find_browser().describe()}
    if not profile_dir(prof).exists():
        out["hint"] = LOGIN_HINT
        return out
    read = _load_session(prof)
    if read is None or not _header_valid(read[0]):
        read = _read_profile(prof)
        if read is None:
            _forget_session(prof)
            out["hint"] = LOGIN_HINT
            return out
        _save_session(prof, *read)
    header, mask = read
    with _cache_lock:
        _cache[prof] = header
    out.update(logged_in=True, account_mask=mask, cookies=redact_cookie_header(header))
    return out


def _profile_in_use(udd: Path) -> bool:
    """True when a live process holds the profile (Linux/macOS lock symlink is ``host-pid``)."""
    lock = udd / "SingletonLock"
    try:
        target = os.readlink(lock)
    except OSError:
        return False
    host, _, pid = target.rpartition("-")
    if host != socket.gethostname() or not pid.isdigit():
        return False
    try:
        os.kill(int(pid), 0)
    except ProcessLookupError:
        return False
    except OSError:
        return True
    return True


def logout(prof: str | None = None) -> list[str]:
    """Delete the profile directory (signs out for certain) and any legacy session copy."""
    prof = prof or profile()
    removed: list[str] = []
    with _cache_lock:
        _cache.pop(prof, None)
    udd = profile_dir(prof)
    if udd.exists():
        if _profile_in_use(udd):
            raise AuthProfileBusy(f"The browser profile {udd} is in use by another process.")
        try:
            shutil.rmtree(udd)
        except OSError as exc:  # Windows refuses to delete files a browser holds open
            raise AuthProfileBusy(f"The browser profile {udd} is in use by another process.") from exc
        removed.append(str(udd))
    count = _cleanup_legacy(force=True)
    if count:
        removed.append(f"{count} legacy session cop{'y' if count == 1 else 'ies'}")
    return removed


# ---- one-time cleanup of sessions stored by earlier versions (D5) -----------------

_cleanup_done = False


def _cleanup_legacy(force: bool = False) -> int:
    """Delete legacy ``session*.json`` files once per machine; never raises."""
    global _cleanup_done
    marker = data_dir() / _LEGACY_MARKER
    if not force and (_cleanup_done or marker.exists()):
        _cleanup_done = True
        return 0
    removed = 0
    try:
        cfg = config_dir()
        files = [cfg / "session.json", *cfg.glob("session-*.json")] if cfg.is_dir() else []
        for f in files:
            if f.exists():
                f.unlink()
                removed += 1
    except OSError:
        pass
    try:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.touch()
    except OSError:
        pass
    _cleanup_done = True
    return removed
