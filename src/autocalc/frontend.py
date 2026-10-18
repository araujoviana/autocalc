"""The calculator's frontend version, and whether a service was verified against it."""

from __future__ import annotations

import re

import httpx

from autocalc.auth import CALCULATOR_URL
from autocalc.services import VERIFIED

_RE = re.compile(r"CBC-PortalCalculator/([0-9.]+)")


def live_version() -> str | None:
    """The version the live calculator page loads, or None when it cannot be read."""
    try:
        return (m := _RE.search(httpx.get(CALCULATOR_URL, timeout=20, follow_redirects=True).text)) and m.group(1)
    except httpx.HTTPError:
        return None


def warnings(services: list[str], live: str | None) -> list[str]:
    """One line per service verified on another frontend version than ``live``."""
    if live is None:
        return ["Could not read the calculator's frontend version; the publish gate still checks every card."]
    return [f"{s} was verified on calculator frontend {VERIFIED[s]}, the live one is {live}; the publish gate "
            "still checks every card." for s in sorted(set(services)) if VERIFIED.get(s) != live]
