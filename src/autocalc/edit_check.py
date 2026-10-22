"""Anonymous per-card Edit check: does the website's Edit view re-price a saved card to its stored amount?

Edit rebuilds a card's form from ``rewriteValue`` alone and fills any gap with the page's
defaults (docs/explanation/huawei/edit-vs-list-price.md), so a card can be stored at one price
and re-price to another. This module loads each card into the real calculator page, presses
Edit and compares the page's own rating request with the stored card.

The comparison logic here is pure; the browser lives in :mod:`autocalc.edit_check_browser`.
A card that cannot be checked is ``unavailable``, never ``ok`` (ADR-0003: fail closed).
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

OK = "ok"
MISMATCH = "mismatch"
UNAVAILABLE = "unavailable"
TOLERANCE = 0.01  # USD; stored amounts are rounded, the page's are not

Line = tuple[str, str, float | None, float]  # (resource type, spec code, size, quantity)


class EditCheckUnavailable(RuntimeError):
    """The check could not run for this card; the message is the reason shown to the user."""


@dataclass
class CardResult:
    index: int
    title: str
    status: str
    stored: float | None = None
    edit: float | None = None
    added: list[Line] = field(default_factory=list)  # lines Edit adds
    removed: list[Line] = field(default_factory=list)  # lines Edit drops
    reason: str = ""

    @property
    def delta(self) -> float | None:
        return None if self.stored is None or self.edit is None else round(self.edit - self.stored, 6)

    def as_dict(self) -> dict[str, Any]:
        return {"index": self.index, "title": self.title, "status": self.status, "stored": self.stored,
                "edit": self.edit, "delta": self.delta, "added": [list(x) for x in self.added],
                "removed": [list(x) for x in self.removed], "reason": self.reason}


def _short(resource_type: str) -> str:
    return (resource_type or "?").rsplit(".", 1)[-1]


def _size(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def stored_lines(card: dict[str, Any]) -> list[Line]:
    """Priced lines of a saved card. Companion entries without a spec code (image) are not priced."""
    sp = card.get("selectedProduct") or {}
    out: list[Line] = []
    for p in sp.get("productAllInfos") or []:
        spec = p.get("resourceSpecCode")
        if not spec:
            continue
        out.append((_short(p.get("resourceType", "")), spec, _size(p.get("resourceSize")), float(p.get("productNum") or 1)))
    return out


def request_lines(rating_request: dict[str, Any]) -> list[Line]:
    """Lines of a rating request the page sent while re-pricing."""
    return [(_short(x.get("resourceType", "")), x.get("resourceSpecCode", ""), _size(x.get("resourceSize")),
             float(x.get("productNum") or 1)) for x in rating_request.get("productInfos") or []]


def diff_lines(stored: list[Line], edit: list[Line]) -> tuple[list[Line], list[Line]]:
    """Return (added by Edit, removed by Edit), comparing lines as multisets."""
    s, e = Counter(stored), Counter(edit)
    return sorted((e - s).elements(), key=str), sorted((s - e).elements(), key=str)


def stored_amount(card: dict[str, Any]) -> float | None:
    amount = (card.get("selectedProduct") or {}).get("amount")
    return float(amount) if isinstance(amount, (int, float)) and not isinstance(amount, bool) else None


def card_title(card: dict[str, Any], index: int) -> str:
    sp = card.get("selectedProduct") or {}
    return str(sp.get("_customTitle") or sp.get("serviceCode") or f"card {index}")


def judge(index: int, card: dict[str, Any], rating_request: dict[str, Any], edit_amount: float,
          tolerance: float = TOLERANCE) -> CardResult:
    """Compare a card with what the page computed for it during Edit."""
    stored = stored_amount(card)
    title = card_title(card, index)
    if stored is None:
        return CardResult(index, title, UNAVAILABLE, reason="stored card has no numeric amount")
    added, removed = diff_lines(stored_lines(card), request_lines(rating_request))
    agree = abs(edit_amount - stored) <= tolerance and not added and not removed
    return CardResult(index, title, OK if agree else MISMATCH, stored, edit_amount, added, removed)


def run_cards(cards: list[dict[str, Any]], check_one: Callable[[int, dict[str, Any]], CardResult]) -> list[CardResult]:
    """Run ``check_one`` per card; any failure becomes ``unavailable`` with its reason."""
    results: list[CardResult] = []
    for i, card in enumerate(cards):
        try:
            results.append(check_one(i, card))
        except EditCheckUnavailable as exc:
            results.append(CardResult(i, card_title(card, i), UNAVAILABLE, stored_amount(card), reason=str(exc)))
        except Exception as exc:  # noqa: BLE001 - fail closed: anything unexpected is "could not check"
            results.append(CardResult(i, card_title(card, i), UNAVAILABLE, stored_amount(card),
                                      reason=f"{type(exc).__name__}: {str(exc)[:200]}"))
    return results


def all_ok(results: list[CardResult]) -> bool:
    return bool(results) and all(r.status == OK for r in results)


def format_report(results: list[CardResult]) -> str:
    """Per-card table plus a summary; lines that Edit adds or drops are named."""
    rows = []
    for r in results:
        stored = "-" if r.stored is None else f"{r.stored:.5f}"
        edit = "-" if r.edit is None else f"{r.edit:.5f}"
        rows.append(f"{r.index:>3}  {r.status:<11} stored={stored:<12} edit={edit:<12} {r.title[:40]}")
        for ln in r.added:
            rows.append(f"       + Edit adds    {ln[0]} {ln[1]} size={ln[2]} qty={ln[3]:g}")
        for ln in r.removed:
            rows.append(f"       - Edit drops   {ln[0]} {ln[1]} size={ln[2]} qty={ln[3]:g}")
        if r.reason:
            rows.append(f"       ({r.reason})")
    n = Counter(r.status for r in results)
    rows.append(f"\n{n[OK]} ok, {n[MISMATCH]} mismatch, {n[UNAVAILABLE]} unavailable of {len(results)} card(s)")
    return "\n".join(rows)
