"""A fresh, anonymous browser context per run (design D2).

Never the login profile: each run gets its own non-persistent browser and context, so runs
share no cart (the page keeps it in browser storage) and need no session (ADR-0010).
"""

from __future__ import annotations

import os
from collections.abc import Callable, Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from autocalc.auth import find_browser
from autocalc.errors import PageEncodeFailed, ValidationError

_LAUNCH_ARGS = ["--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage"]
VIEWPORT = {"width": 1366, "height": 900}
_SKIPPED = ("image", "font", "media")


def headed() -> bool:
    return os.environ.get("AUTOCALC_PAGE_HEADED") == "1"


def _sync_playwright() -> Any:
    from playwright.sync_api import sync_playwright

    return sync_playwright()


@contextmanager
def page_context(service: str = "", *, lean: bool = False, playwright: Callable[[], Any] = _sync_playwright) -> Generator[Any]:
    """Yield a new Playwright browser context and close it and its browser afterwards.

    ``lean`` skips images, fonts and media (the form needs none of them; about 15% faster page loads),
    except when watching the page headed.
    """
    choice = find_browser()
    with playwright() as p:
        try:
            browser = p.chromium.launch(headless=not headed(), args=_LAUNCH_ARGS, **choice.launch_kwargs())
        except Exception as exc:
            raise PageEncodeFailed(f"Could not start the browser {choice.describe()}.", service=service,
                                   step="browser") from exc
        try:
            ctx = browser.new_context(viewport=VIEWPORT, locale="en-US")
            if lean and not headed():
                ctx.route("**/*", lambda r: r.abort() if r.request.resource_type in _SKIPPED else r.continue_())
            try:
                yield ctx
            finally:
                try:
                    ctx.close()
                except Exception:
                    pass
        finally:
            try:
                browser.close()
            except Exception:
                pass


def _available_memory_bytes() -> int | None:
    """Best-effort available RAM, capped by a Linux container's remaining allowance."""
    estimates = []
    try:
        estimates.append(os.sysconf("SC_AVPHYS_PAGES") * os.sysconf("SC_PAGE_SIZE"))
    except (AttributeError, OSError, ValueError):
        pass
    try:
        limit = (Path("/sys/fs/cgroup") / "memory.max").read_text().strip()
        if limit != "max":
            used = int((Path("/sys/fs/cgroup") / "memory.current").read_text())
            estimates.append(max(0, int(limit) - used))
    except (OSError, ValueError):
        pass
    return min(estimates) if estimates else None


def encode_workers() -> int:
    """Conservative parallel browser budget; an explicit override is checked on use."""
    override = os.environ.get("AUTOCALC_ENCODE_WORKERS")
    if override is not None:
        try:
            workers = int(override)
        except ValueError:
            workers = 0
        if not 1 <= workers <= 16:
            raise ValidationError("AUTOCALC_ENCODE_WORKERS must be an integer from 1 to 16.")
        return workers
    available = _available_memory_bytes()
    memory_budget = max(1, (available - 512 * 1024 ** 2) // (768 * 1024 ** 2)) if available is not None else 1
    return min(3, os.cpu_count() or 1, memory_budget)
