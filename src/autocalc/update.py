"""``autocalc update``: reinstall the tool from a release tag (ADR-0013). Never runs on its own."""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import time
from importlib.metadata import version

from autocalc.auth import config_dir
from autocalc.errors import UpdateFailed

REPO = "https://github.com/araujoviana/autocalc.git"
_TAG = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")


def _repo() -> str:
    return os.environ.get("AUTOCALC_REPO", REPO)


def latest_tag(repo: str) -> str:
    """Newest ``vX.Y.Z`` tag, compared as numbers (``v0.10.0`` is newer than ``v0.9.0``)."""
    try:
        out = subprocess.run(["git", "ls-remote", "--tags", "--refs", repo, "v*"],
                             capture_output=True, text=True, timeout=3)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise UpdateFailed(f"Could not list the release tags: {exc}", hint="Is git installed and the network up?") from exc
    if out.returncode:
        raise UpdateFailed("Could not list the release tags.", hint=(out.stderr.strip() or "Check network and git access."))
    tags = [t for line in out.stdout.splitlines() if (t := line.rpartition("refs/tags/")[2]) and _TAG.match(t)]
    if not tags:
        raise UpdateFailed("No release tag (vX.Y.Z) found.", hint="Pass --to vX.Y.Z, or ask the maintainer to tag a release.")
    return max(tags, key=lambda t: tuple(map(int, _TAG.match(t).groups())))


def update(to: str | None = None) -> str:
    """Reinstall from ``to`` (a release tag) or the newest tag; returns a one-line summary."""
    if to is not None and not _TAG.match(to):
        raise UpdateFailed(f"{to!r} is not a release tag.", hint="Use the form vX.Y.Z, e.g. --to v0.2.0.")
    repo, old = _repo(), version("autocalc")
    tag = to or latest_tag(repo)
    # shortcut: on Windows the running autocalc.exe can be locked; then rerun install.ps1.
    try:
        done = subprocess.run(["uv", "tool", "install", "--force", f"git+{repo}@{tag}"], capture_output=True, text=True)
    except OSError as exc:
        raise UpdateFailed(f"Could not run uv: {exc}", hint="Install uv (https://docs.astral.sh/uv/) or run the installer.") from exc
    if done.returncode:
        raise UpdateFailed(f"uv could not install {tag}.", hint=done.stderr.strip()[-300:] or None)
    return f"autocalc {old} -> {tag.removeprefix('v')}"


def _key(tag: str) -> tuple[int, ...]:
    return tuple(map(int, re.findall(r"\d+", tag)[:3]))


def notice() -> str | None:
    """A one-line update notice, at most one tag lookup a day; never raises, never updates (ADR-0013)."""
    if os.environ.get("AUTOCALC_NO_UPDATE_CHECK"):
        return None
    stamp = config_dir() / "update-check.json"
    try:
        seen = json.loads(stamp.read_text())
        if time.time() - seen["at"] < 86400:
            return None
    except (OSError, ValueError, KeyError):
        pass
    try:
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.write_text(json.dumps({"at": time.time()}))
        tag = latest_tag(_repo())
        have = version("autocalc")
    except Exception:  # offline, no tag or an unwritable config dir must not break a tool call
        return None
    return f"autocalc {tag.removeprefix('v')} is available (you have {have}); run `autocalc update`." \
        if _key(tag) > _key(have) else None


def with_notice(result):
    """Attach notices to objects, or log them without changing a list/scalar contract."""
    if note := notice():
        if isinstance(result, dict):
            return {**result, "update_notice": note}
        logging.getLogger(__name__).warning("%s", note)
    return result
