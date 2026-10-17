"""Draft → revise → publish (ADR-0007). The only route from a request to a share link."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any, Literal

from autocalc import tools
from autocalc.core import DraftStore, Requirement, decide
from autocalc.core import draft_quote as _draft
from autocalc.core.ranking import rank
from autocalc.errors import ValidationError
from autocalc.gate import publish_checked
from autocalc.page.replay import encode_card
from autocalc.providers.huawei import HuaweiProvider
from autocalc.services import build as build_card

# the builder argument that takes the chosen spec; services missing here are not publishable yet
_SPEC_ARG = {"ecs": "flavor", "evs": "type", "rds": "flavor", "sfsturbo": "tier"}
SHOWN = 5


@tools.tool
def draft_quote(customer: str, requirements: list[dict[str, Any]]) -> dict[str, Any]:
    """Start a quote. Each requirement: {"id","service","region","billing":"ondemand|monthly|yearly",
    "quantity"?,"needs"?:{"vcpus":4,"memory_gb":16},"spec"?, "options"?:{service builder options such as image, system_disk, size_gb}}.

    Exact matches are confirmed automatically; for the others show the candidates to the user and
    call revise_quote. Nothing is saved on the website. Sizes in GB, bandwidth in Mbit/s.
    """
    calc = tools.calc
    reqs = []
    for r in requirements:
        r = {**r, "region": tools._region(r["region"])} if r.get("region") else r
        reqs.append(Requirement.from_dict(r))
    provider = HuaweiProvider(calc)
    draft = _draft(provider, customer, reqs, DraftStore())
    return _view(draft, provider)


def _view(draft, provider) -> dict[str, Any]:
    decided = {d.requirement_id: d for d in draft.decisions}
    rows = []
    for r in draft.requirements:
        d = decided.get(r.id)
        row: dict[str, Any] = {"id": r.id, "service": r.service, "decision": d.to_dict() if d else None}
        if not d:
            row["candidates"] = [{"spec": x.candidate.spec, "price": str(x.candidate.price), "reason": x.reason}
                                 for x in rank(r, provider.candidates(r))[:SHOWN]]
        rows.append(row)
    return {"draft_id": draft.id, "pending": draft.pending(), "requirements": rows}


@tools.tool
def revise_quote(draft_id: str, decisions: list[dict[str, str]]) -> dict[str, Any]:
    """Record the user's choices: decisions = [{"requirement_id","spec","justification"}]. Returns what is still pending."""
    store = DraftStore()
    for d in decisions:
        decide(store, draft_id, d["requirement_id"], d["spec"], d["justification"])
    return {"draft_id": draft_id, "pending": store.load(draft_id).pending()}


@tools.tool
def publish_quote(draft_id: str, name: str, settlement: Literal["total", "monthly"] = "total",
                  currency: str = "USD") -> dict[str, Any]:
    """Publish a fully decided draft: builds the cards, saves the list, verifies it on the website and returns the link.

    Needs a login (auth_login). Confirm the totals with the user first. A failed check deletes the list.
    """
    draft = DraftStore().load(draft_id)
    if draft.pending():
        raise ValidationError(f"Draft {draft_id} still has undecided requirements.", field="requirement_id",
                              allowed=draft.pending(), hint="Call revise_quote for each of them.")
    unsupported = sorted({r.service for r in draft.requirements} - set(_SPEC_ARG))
    if unsupported:
        raise ValidationError(f"publish_quote cannot build {unsupported} yet.", field="service", allowed=sorted(_SPEC_ARG))
    spec = {d.requirement_id: d.spec for d in draft.decisions}
    built = [build_card(r.service, calc=tools.calc, region=r.region, billing=r.billing, quantity=r.quantity,
                        **{_SPEC_ARG[r.service]: spec[r.id]}, **r.options) for r in draft.requirements]
    # The builders say what to fill in; the page builds the card that is saved (ADR-0001).
    with ThreadPoolExecutor(max_workers=3) as pool:  # each encode has its own browser context (ADR-0010)
        cards = list(pool.map(lambda pair: encode_card(pair[0].service, pair[1]["rewriteValue"]),
                              zip(draft.requirements, built, strict=True)))
    out = publish_checked(name, cards, settlement=settlement, currency=currency.upper(), calc=tools.calc)
    return {"draft_id": draft_id, "id": out["id"], "url": out["url"], "checks": out["checks"]}
