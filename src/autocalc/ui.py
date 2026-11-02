"""Terminal rendering for the commands people read. Plain text unless the stream is a terminal.

Nothing here touches JSON output: machine-facing commands print JSON and never call this module.
"""

from __future__ import annotations

import os
import sys
from typing import Any, TextIO

_COLORS = {"green": "32", "yellow": "33", "red": "31", "dim": "2", "bold": "1"}
_GLYPHS = {"ok": ("✓", "green", "[ok]  "), "warn": ("⚠", "yellow", "[warn]"), "fail": ("✗", "red", "[FAIL]")}
_vt_enabled = False


def fancy(stream: TextIO | None = None) -> bool:
    """True when ``stream`` is a terminal that should get colors and glyphs."""
    stream = stream or sys.stdout
    if os.environ.get("NO_COLOR") or os.environ.get("TERM") == "dumb":
        return False
    if not (hasattr(stream, "isatty") and stream.isatty()):
        return False
    global _vt_enabled
    if os.name == "nt" and not _vt_enabled:
        os.system("")  # shortcut: turns on ANSI handling in the Windows console; upgrade if it stops working on new hosts
        _vt_enabled = True
    return True


def paint(text: str, color: str, stream: TextIO | None = None) -> str:
    return f"\x1b[{_COLORS[color]}m{text}\x1b[0m" if fancy(stream) else text


def _can_print(text: str, stream: TextIO) -> bool:
    try:
        text.encode(getattr(stream, "encoding", None) or "ascii")
        return True
    except (UnicodeEncodeError, LookupError):
        return False


def status(kind: str, text: str, stream: TextIO | None = None) -> str:
    """One check line: ``✓ text`` on a terminal (``[ok] text`` when the encoding lacks the glyph), plain otherwise."""
    stream = stream or sys.stdout
    glyph, color, plain = _GLYPHS[kind]
    if not fancy(stream):
        return f"{plain} {text}"
    mark = glyph if _can_print(glyph, stream) else plain.strip()
    return f"{paint(mark, color, stream)} {text}"


def table(rows: list[tuple[Any, ...]], headers: tuple[str, ...] | None = None) -> str:
    """Left-aligned columns, two spaces apart; the last column is not padded."""
    grid = [tuple(str(c) for c in r) for r in ([headers] if headers else []) + rows]
    widths = [max(len(r[i]) for r in grid) for i in range(len(grid[0]))] if grid else []
    lines = ["  ".join(c.ljust(w) if i < len(r) - 1 else c for i, (c, w) in enumerate(zip(r, widths, strict=True)))
             for r in grid]
    if headers and fancy():
        lines[0] = paint(lines[0], "bold")
    return "\n".join(lines)
