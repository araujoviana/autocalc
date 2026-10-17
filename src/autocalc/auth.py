"""Authentication for the calculator's *write* endpoints (share/add, share/list...).

Design goals (backlog Epic A):
  * A1 - one-time browser login with a persistent profile; we never touch the password.
  * A2 - silent refresh from the persistent profile before falling back to AUTH_EXPIRED.
  * A4b - import a "Copy as cURL" session (clipboard or stdin).
  * A5 - store the session in the OS keyring, else a 0600 file; never log cookie values.

Only ``share/*`` (save, list, update, delete, copy) and ``formExport`` need this.
Catalog, rating and anonymous ``share/detail`` do not.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import shutil
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from autocalc.client import CALC, CalculatorError
from autocalc.errors import AuthExpired, AuthLoginFailed

CALCULATOR_URL = "https://www.huaweicloud.com/intl/en-us/pricing/calculator.html"
COOKIE_DOMAINS = (".huaweicloud.com", "www.huaweicloud.com", "console-intl.huaweicloud.com", "portal-intl.huaweicloud.com")
KEYRING_SERVICE = "autocalc"
# cookies that alone are enough to authenticate the calculator write API (A3)
CORE_COOKIES = ("cbc-sid", "HWS_INTL_ID", "SessionID", "portal_csrf", "account-intl_cftk")


def config_dir() -> Path:
    return Path(os.environ.get("AUTOCALC_CONFIG", Path.home() / ".config" / "autocalc"))


def data_dir() -> Path:
    return Path(os.environ.get("AUTOCALC_DATA", Path.home() / ".local" / "share" / "autocalc"))


def profile() -> str:
    return os.environ.get("AUTOCALC_PROFILE", "default")


def profile_dir(name: str | None = None) -> Path:
    name = name or profile()
    p = data_dir() / "browser-profile"
    return p if name == "default" else p.with_name(f"browser-profile-{name}")


def browser_executable() -> str | None:
    """System Chromium-family browser to drive, so Playwright upgrades can't break login.

    ``AUTOCALC_BROWSER`` overrides the search; None falls back to Playwright's bundled build.
    """
    if env := os.environ.get("AUTOCALC_BROWSER"):
        return env
    for name in ("chromium", "chromium-browser", "google-chrome-stable", "google-chrome", "microsoft-edge-stable"):
        if path := shutil.which(name):
            return path
    return None


# ---- redaction --------------------------------------------------------------


def redact_cookie_header(header: str) -> str:
    parts = [p.strip() for p in (header or "").split(";") if p.strip()]
    names = [p.split("=", 1)[0] for p in parts]
    return f"{len(names)} cookies ({', '.join(names[:6])}{'...' if len(names) > 6 else ''})"


# ---- session model ----------------------------------------------------------


def cookie_domains_for(host: str) -> bool:
    h = host.lstrip(".")
    return h.endswith("huaweicloud.com")


@dataclass
class Session:
    cookie_header: str
    account_mask: str | None = None
    saved_at: float = field(default_factory=time.time)
    source: str = "login"
    profile: str = "default"

    def age_hours(self) -> float:
        return (time.time() - self.saved_at) / 3600

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class SessionStore:
    """Persist sessions in the OS keyring, else a 0600 JSON file (A5)."""

    def __init__(self, prof: str | None = None):
        self.profile = prof or profile()
        self.file = config_dir() / ("session.json" if self.profile == "default" else f"session-{self.profile}.json")

    def _key(self) -> str:
        return f"session:{self.profile}"

    def _keyring(self):
        try:
            import keyring  # type: ignore
            kr = keyring.get_keyring()
            backend = kr.__class__.__name__.lower()
            if "fail" in backend or "null" in backend:
                return None
            return keyring
        except Exception:
            return None

    def load(self) -> Session | None:
        kr = self._keyring()
        if kr is not None:
            try:
                raw = kr.get_password(KEYRING_SERVICE, self._key())
                if raw:
                    return Session(**json.loads(raw))
            except Exception:
                pass
        if self.file.exists():
            try:
                return Session(**json.loads(self.file.read_text()))
            except Exception:
                return None
        return None

    def save(self, session: Session) -> str:
        session.profile = self.profile
        blob = json.dumps(session.as_dict())
        kr = self._keyring()
        if kr is not None:
            try:
                kr.set_password(KEYRING_SERVICE, self._key(), blob)
                return "keyring"
            except Exception:
                pass
        self.file.parent.mkdir(parents=True, exist_ok=True)
        self.file.write_text(blob)
        try:
            os.chmod(self.file, 0o600)
        except OSError:
            pass
        return f"file {self.file}"

    def clear(self) -> None:
        kr = self._keyring()
        if kr is not None:
            try:
                kr.delete_password(KEYRING_SERVICE, self._key())
            except Exception:
                pass
        if self.file.exists():
            self.file.unlink()


# ---- cURL import (A4b) ------------------------------------------------------


def parse_curl(text: str) -> str:
    """Extract the Cookie header value from a 'Copy as cURL' string (bash/cmd/PS)."""
    text = (text or "").strip()
    if not text:
        raise AuthLoginFailed("empty cURL text", hint="Pipe a 'Copy as cURL' command into `autocalc auth import`.")
    # PowerShell/cmd quote the URL with double quotes; shlex handles posix fine.
    tokens = shlex.split(text.replace("\\\n", " ").replace("^", ""))
    cookie = None
    for i, t in enumerate(tokens):
        if t in ("-H", "--header") and i + 1 < len(tokens):
            k, _, v = tokens[i + 1].partition(":")
            if k.strip().lower() == "cookie":
                cookie = v.strip()
        elif t in ("-b", "--cookie") and i + 1 < len(tokens):
            cookie = tokens[i + 1]
    if not cookie:
        # PowerShell: -Headers @{ "Cookie" = "..." }  or a bare Cookie: line
        m = re.search(r'[\"\']?cookie[\"\']?\s*[=:]\s*[\"\']([^\"\']+)[\"\']', text, re.I)
        if m:
            cookie = m.group(1)
    if not cookie:
        raise AuthLoginFailed("no Cookie header found in the cURL", hint="Copy a `portalcalculatornodeservice` request as cURL.")
    return cookie


def import_from_clipboard() -> str:
    """Read 'Copy as cURL' from the WSL clipboard via powershell.exe (A4b)."""
    import subprocess
    try:
        out = subprocess.run(["powershell.exe", "-NoProfile", "-Command", "Get-Clipboard", "-Raw"],
                             capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError) as exc:
        raise AuthLoginFailed(f"clipboard unavailable: {exc}",
                              hint="Run `autocalc auth import -` and paste the cURL, then Ctrl-D.") from exc
    return out.stdout


# ---- browser login (A1) / refresh (A2) --------------------------------------


def _cookie_header(cookies: Any) -> str:
    seen: dict[str, str] = {}
    for c in cookies:
        if cookie_domains_for(c.get("domain", "")):
            seen[c["name"]] = c["value"]
    return "; ".join(f"{k}={v}" for k, v in seen.items())


def _probe_login(ctx: Any, timeout: float) -> bool:
    """Poll share/list; 200 means logged in, CBC.0101 means not yet."""
    deadline = time.time() + timeout
    url = f"{CALC}/share/list"
    while time.time() < deadline:
        try:
            r = ctx.request.get(url, timeout=15000)
            if r.status == 200 and str(r.json().get("retCode")) == "200":
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


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


def login(prof: str | None = None, timeout: float = 300, headless: bool = False) -> Session:
    """Open a headed browser to the calculator, wait for the user to sign in, save cookies."""
    from playwright.sync_api import sync_playwright

    prof = prof or profile()
    udd = profile_dir(prof)
    udd.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(udd), headless=headless, executable_path=browser_executable(),
            args=["--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage"],
            viewport={"width": 1366, "height": 900},
        )
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            try:
                page.goto(CALCULATOR_URL, wait_until="domcontentloaded", timeout=60000)
            except Exception:
                pass
            if not _probe_login(ctx, timeout):
                raise AuthLoginFailed(
                    "Timed out waiting for login.",
                    hint="Run `autocalc login` again and finish signing in within 5 minutes.",
                )
            cookies = ctx.cookies()
            header = _cookie_header(cookies)
            if not header:
                raise AuthLoginFailed("logged in but no huaweicloud cookies were captured")
            sess = Session(cookie_header=header, account_mask=_mask(ctx), source="login", profile=prof)
        finally:
            ctx.close()
    store = SessionStore(prof)
    store.save(sess)
    return sess


def refresh(prof: str | None = None, timeout: float = 120) -> Session:
    """Silently re-capture cookies from the persistent profile, headless (A2)."""
    from playwright.sync_api import sync_playwright

    prof = prof or profile()
    udd = profile_dir(prof)
    if not udd.exists():
        raise AuthExpired("No browser profile to refresh from.", hint="Run `autocalc login` first.")
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(udd), headless=True, executable_path=browser_executable(),
                                                   args=["--no-first-run", "--disable-dev-shm-usage"])
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            try:
                page.goto(CALCULATOR_URL, wait_until="domcontentloaded", timeout=45000)
            except Exception:
                pass
            if not _probe_login(ctx, timeout):
                raise AuthExpired("Silent refresh failed; the SSO session is gone.",
                                  hint="Run `autocalc login` to sign in again.")
            sess = Session(cookie_header=_cookie_header(ctx.cookies()), account_mask=_mask(ctx),
                           source="refresh", profile=prof)
        finally:
            ctx.close()
    SessionStore(prof).save(sess)
    return sess


def migrate_session_curl(repo_session: Path) -> bool:
    """Import a legacy repo ``.session.curl`` once, then delete it (A5)."""
    if not repo_session.exists():
        return False
    try:
        header = parse_curl(repo_session.read_text())
    except CalculatorError:
        return False
    SessionStore().save(Session(cookie_header=header, source="import"))
    try:
        repo_session.unlink()
    except OSError:
        pass
    return True


def status() -> dict[str, Any]:
    store = SessionStore()
    sess = store.load()
    if not sess:
        return {"logged_in": False, "profile": store.profile,
                "hint": "Run `autocalc login` to sign in once in a browser window."}
    return {"logged_in": True, "profile": store.profile, "account_mask": sess.account_mask,
            "age_hours": round(sess.age_hours(), 2), "source": sess.source,
            "cookies": redact_cookie_header(sess.cookie_header)}
