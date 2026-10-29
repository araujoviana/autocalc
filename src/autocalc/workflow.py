"""Draft → revise → publish (ADR-0007). The only route from a request to a share link."""

from __future__ import annotations

import inspect
import threading
from concurrent.futures import ThreadPoolExecutor
from functools import wraps
from typing import Any, Literal

from autocalc import frontend, tools
from autocalc.core import DraftStore, Requirement
from autocalc.core import draft_quote as _draft
from autocalc.core.draft import decide_many
from autocalc.core.ranking import rank
from autocalc.errors import ValidationError
from autocalc.gate import publish_checked
from autocalc.page.browser import encode_workers
from autocalc.page.replay import encode_card
from autocalc.providers.huawei import HuaweiProvider
from autocalc.services import VERIFIED, get_builder
from autocalc.services.forms import RECIPES
from autocalc.share import Session

_DRAFT_LOCK = threading.RLock()


def _serialized(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        draft_id = args[0] if args else kwargs["draft_id"]
        with _DRAFT_LOCK, DraftStore().lock(draft_id):
            return fn(*args, **kwargs)
    return wrapped


SHOWN = 5


@tools.tool
def draft_quote(customer: str, requirements: list[dict[str, Any]]) -> dict[str, Any]:
    """Start a quote. Each requirement: {"id","service","region","billing":"ondemand|monthly|yearly",
    "quantity"?,"needs"?:{"vcpus":4,"memory_gb":16},"spec"?, "options"?:{the service's options, listed by supported_services}}.

    Exact matches are confirmed automatically; for the others show the candidates to the user and
    call revise_quote. Nothing is saved on the website. Sizes in GB, bandwidth in Mbit/s.
    """
    calc = tools.calc
    if not isinstance(requirements, list) or not requirements:
        raise ValidationError("requirements must be a nonempty list.", field="requirements")
    reqs = []
    for r in requirements:
        if not isinstance(r, dict):
            raise ValidationError("Each requirement must be an object.", field="requirements")
        r = {**r, "region": tools._region(r["region"])} if r.get("region") else r
        reqs.append(Requirement.from_dict(r))
    for r in reqs:
        if r.options and (unknown := sorted(set(r.options) - set(allowed := get_builder(r.service, tools.calc).options()))):
            raise ValidationError(f"{r.service} has no option {unknown[0]!r}.", field=unknown[0], allowed=allowed,
                                  hint="supported_services lists each service's options.")
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
    draft = decide_many(store, draft_id, decisions)
    return {"draft_id": draft_id, "pending": draft.pending()}


@tools.tool
@_serialized
def publish_quote(draft_id: str, name: str, settlement: Literal["total", "monthly"] = "total",
                  currency: str = "USD") -> dict[str, Any]:
    """Publish a fully decided draft: builds the cards, saves the list, verifies it on the website and returns the link.

    Needs a login (auth_login). Confirm the totals with the user first. A failed check deletes the list.
    """
    store = DraftStore()
    draft = store.load(draft_id)
    if draft.publication:
        return draft.publication
    tools._validate_list_name(name)
    if draft.publishing:
        raise ValidationError("A previous publication has an unknown outcome. Use inspect_draft; check saved lists before recover_draft.", field="draft_id")
    if any(r.az is not None for r in draft.requirements):
        raise ValidationError("Availability-zone selection is not supported yet.", field="az")
    if draft.pending():
        raise ValidationError(f"Draft {draft_id} still has undecided requirements.", field="requirement_id",
                              allowed=draft.pending(), hint="Call revise_quote for each of them.")
    unsupported = sorted({r.service.lower() for r in draft.requirements} - set(VERIFIED))
    if unsupported:
        raise ValidationError(f"publish_quote cannot build {unsupported} yet.", field="service", allowed=sorted(VERIFIED))
    spec = {d.requirement_id: d.spec for d in draft.decisions}
    for r in draft.requirements:
        builder = get_builder(r.service, tools.calc)
        if r.service.lower() in RECIPES and not builder.spec_arg:
            raise ValidationError(f"{r.service} cannot apply the selected catalog spec to its form.", field="spec",
                                  hint="Publication is blocked until a verified catalog-to-form mapping exists.")
        if r.billing not in builder.modes:
            raise ValidationError(f"{r.service} does not support {r.billing!r}.", field="billing", allowed=list(builder.modes))
        if r.quantity != 1 and r.service in {"nat", "obs", "lts", "function", "elb", "cci", "nosql"}:
            raise ValidationError(f"{r.service} cannot express quantity on its form.", field="quantity", allowed=[1])
        chosen = {builder.spec_arg: builder.spec_option(spec[r.id])} if builder.spec_arg else {}
        duplicate = set(r.options) & (set(chosen) | {"region", "billing", "quantity"})
        if duplicate:
            raise ValidationError("Options duplicate requirement fields.", field=sorted(duplicate)[0])
        try:
            signature = builder.input_signature() if hasattr(builder, "input_signature") else inspect.signature(builder.build)
            signature.bind(region=r.region, billing=r.billing, quantity=r.quantity, **chosen, **r.options)
        except TypeError as exc:
            raise ValidationError(f"Invalid {r.service} builder options: {exc}", field="options") from exc
    session = Session()
    session.lists()  # fail now, not after minutes of encoding, when the profile is not signed in
    spec = {d.requirement_id: d.spec for d in draft.decisions}
    built = []
    for r in draft.requirements:
        builder = get_builder(r.service, tools.calc)
        chosen = {builder.spec_arg: builder.spec_option(spec[r.id])} if builder.spec_arg else {}
        card_input = {"rewriteValue": builder.form(region=r.region, billing=r.billing, quantity=r.quantity, **chosen, **r.options)}
        if r.quantity != 1 and "global_QUANTITY" not in card_input["rewriteValue"]:
            raise ValidationError(f"{r.service} did not encode the requested quantity.", field="quantity", allowed=[1])
        built.append(card_input)
    # The builders say what to fill in; the page builds the card that is saved (ADR-0001).
    with ThreadPoolExecutor(max_workers=min(len(built), encode_workers())) as pool:  # each encode has its own browser context (ADR-0010)
        cards = list(pool.map(lambda pair: encode_card(pair[0].service.lower(), pair[1]["rewriteValue"]),
                              zip(draft.requirements, built, strict=True)))
    for r, card in zip(draft.requirements, cards, strict=True):
        card["selectedProduct"]["_customTitle"] = r.id  # the customer sees the requirement's name, not "custom.ecs 1"
    for requirement, card in zip(draft.requirements, cards, strict=True):
        builder = get_builder(requirement.service, tools.calc)
        if not builder.spec_arg:
            actual_specs = {product.get("resourceSpecCode") for product in card["selectedProduct"].get("productAllInfos", [])}
            if spec[requirement.id] not in actual_specs:
                raise ValidationError(f"Encoded {requirement.service} card does not contain the selected spec {spec[requirement.id]!r}.", field="spec")
    draft.publishing = True
    store.save(draft)  # a crash or ambiguous upstream response must never trigger an automatic duplicate
    out = publish_checked(name, cards, settlement=settlement, currency=currency.upper(), session=session, calc=tools.calc)
    result = {"draft_id": draft_id, "id": out["id"], "url": out["url"], "checks": out["checks"],
              }
    draft.publication = result
    draft.publishing = False
    store.save(draft)  # persist the verified remote result before optional metadata work
    store.link(out["id"], draft_id)
    notes = frontend.warnings([r.service.lower() for r in draft.requirements], frontend.live_version())
    if notes:
        result = {**result, "warnings": notes}
        draft.publication = result
        store.save(draft)
    return result


@tools.tool
def list_drafts() -> list[dict[str, Any]]:
    """List local quote drafts with their ids, customer labels and creation timestamps."""
    return DraftStore().list()


@tools.tool
def inspect_draft(draft_id: str) -> dict[str, Any]:
    """Inspect local publication state, including a previous attempt with an unknown outcome."""
    return DraftStore().inspect(draft_id)


@tools.tool
def recover_draft(draft_id: str, confirmed_no_remote_list: bool, justification: str) -> dict[str, Any]:
    """Reset an interrupted publication only after the user checked saved lists and confirmed no remote list exists.

    This changes local state only. If a list exists, keep the draft blocked and inspect that saved list instead.
    """
    return DraftStore().recover(draft_id, confirmed_no_remote_list, justification)
