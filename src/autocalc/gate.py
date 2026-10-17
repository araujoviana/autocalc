"""Publish gate (ADR-0003): save a list, check it on the website's own terms, or delete it.

Three checks per card: the list re-read anonymously and validated, the stored amount against a
fresh rating-engine price, and the amount the page recomputes in the card's Edit view.
Anything that fails, or cannot run, deletes the list and raises ``GateFailed``.
"""

from __future__ import annotations

import copy
import os
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from decimal import Decimal
from typing import Any

from autocalc.client import Calculator
from autocalc.errors import GateFailed
from autocalc.page.edit_check import EditResult, edit_check
from autocalc.page.store import cents
from autocalc.services import get_builder
from autocalc.services.base import SHARE_URL, Builder
from autocalc.share import Session, share_detail
from autocalc.validate import validate_list

_BILLING = {"MONTHLY": "monthly", "YEARLY": "yearly", "ONDEMAND": "ondemand", "RI": "ri"}
RATING_WORKERS = 4  # ADR-0010: reads, at most 4 in flight


@dataclass
class CardCheck:
    index: int
    title: str
    stored: Decimal
    rated: Decimal | None = None
    edit: Decimal | None = None
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return {**{k: (str(v) if isinstance(v, Decimal) else v) for k, v in d.items()}, "ok": self.ok}


def rerate(card: dict[str, Any], calc: Calculator | None = None) -> Decimal:
    """The card's total, recomputed by the rating engine from its own stored products, in cents."""
    sp = card["selectedProduct"]
    products = copy.deepcopy(sp["productAllInfos"])
    billing = _BILLING[sp["chargeModeName"]]
    if billing == "ri":
        ri = card["rewriteValue"]["template_RENDER"]["calculator_ecs_RIRadio"]["RITime"]
        get_builder("ecs", calc)._price_ri(products, sp["region"], ri.split("nodeData.")[-1])  # type: ignore[attr-defined]
    else:
        Builder(calc).price(products, sp["region"], billing, sp.get("periodNum") or 1, sp["timeTag"])
    return cents(sum(Decimal(str(p["inquiryResult"]["amount"])) for p in products))


def _title(card: dict[str, Any]) -> str:
    sp = card["selectedProduct"]
    return sp.get("_customTitle") or sp.get("serviceCode", "card")


def verify(list_id: str, calc: Calculator, edit: Callable[[str], list[EditResult]] = edit_check,
           rate: Callable[[dict[str, Any]], Decimal] | None = None) -> tuple[list[CardCheck], list[str]]:
    """Run the three checks on a saved list. Returns per-card results and list-level issues."""
    rate = rate or (lambda card: rerate(card, calc))
    detail = share_detail(calc, list_id)
    cards = detail.get("cartListData") or []
    issues = validate_list(detail)["issues"]
    checks = [CardCheck(i, _title(c), cents(c["selectedProduct"]["amount"])) for i, c in enumerate(cards)]

    def rated(card: dict[str, Any]) -> Decimal | str:
        try:
            return rate(card)
        except Exception as exc:  # a card we cannot re-price is a failed card
            return f"could not be re-priced: {exc}"

    with ThreadPoolExecutor(RATING_WORKERS) as pool:
        for chk, r in zip(checks, pool.map(rated, cards), strict=True):
            if isinstance(r, str):
                chk.problems.append(r)
            else:
                chk.rated = r
                if r != chk.stored:
                    chk.problems.append(f"rating engine prices the products at {r}, stored {chk.stored}")

    results = {r.index: r for r in edit(list_id)}
    for chk in checks:
        r = results.get(chk.index)
        if r is None:
            chk.problems.append("the Edit check returned no result for this card")
            continue
        chk.edit = r.edit
        if not r.equal:
            chk.problems.append(r.reason or f"Edit re-prices to {r.edit}, stored {chk.stored}")
    # validation issues name the card by title in brackets
    for chk in checks:
        chk.problems += [i for i in issues if i.startswith(f"[{chk.title}]")]
    return checks, [i for i in issues if not any(i.startswith(f"[{c.title}]") for c in checks)]


def publish_checked(name: str, cards: list[dict[str, Any]], settlement: str = "total", currency: str = "USD",
                    session: Session | None = None, calc: Calculator | None = None,
                    check: Callable[..., tuple[list[CardCheck], list[str]]] = verify) -> dict[str, Any]:
    """Save ``cards`` as a list, verify it, and return its link; on any failure delete it and raise."""
    session, calc = session or Session(), calc or Calculator()
    payload = Builder.share_payload(name, cards, settlement=settlement)
    list_id = session.create(payload)
    try:
        checks, issues = check(list_id, calc)
        error = None if all(c.ok for c in checks) and not issues else "the list did not pass the publish gate"
    except Exception as exc:  # fail closed: a check that cannot run is a failed check
        checks, issues, error = [], [], f"the publish gate could not run: {exc}"
        cause: Exception | None = exc
    else:
        cause = None
    if error is None:
        return {"id": list_id, "url": SHARE_URL.format(id=list_id, currency=currency), "name": name,
                "total_usd": payload["totalPrice"]["amount"], "checks": [c.to_dict() for c in checks]}

    kept = os.environ.get("AUTOCALC_KEEP_ON_FAIL") == "1"
    note = f" The list {list_id} was kept (AUTOCALC_KEEP_ON_FAIL=1)." if kept else ""
    if not kept:
        try:
            session.delete(list_id)
        except Exception:
            note = f" It could not be deleted: delete list {list_id} by hand."
    raise GateFailed(error + "." + note, cards=[c.to_dict() for c in checks] + [{"issue": i} for i in issues],
                     list_id=list_id if kept or note else None) from cause
