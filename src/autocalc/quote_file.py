"""Declarative quotes (ADR-0018): a YAML file of cards, validated offline against the service schemas,
planned without touching the website, applied through the publish gate."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from autocalc import tools
from autocalc.errors import ValidationError
from autocalc.schema import generate
from autocalc.services import get_builder

CARD_FIELDS = {"id", "service", "region", "billing", "quantity", "needs", "spec", "options"}
SCHEMA_HINT = "Read the autocalc://schema/<service> resource, or run `autocalc schema coverage <service>`."


@dataclass
class Quote:
    customer: str
    cards: list[dict[str, Any]]
    name: str | None = None
    settlement: str = "total"
    path: Path | None = field(default=None, compare=False)


def parse(text: str, path: Path | None = None) -> Quote:
    doc = yaml.safe_load(text)
    if not isinstance(doc, dict) or not isinstance(doc.get("cards"), list) or not doc["cards"]:
        raise ValidationError("A quote file needs a customer and a nonempty list of cards.", field="cards")
    defaults = doc.get("defaults") or {}
    if unknown := sorted(set(defaults) - {"region", "billing"}):
        raise ValidationError(f"defaults has no field {unknown[0]!r}.", field=unknown[0], allowed=["region", "billing"])
    cards = [{**defaults, **c} for c in doc["cards"] if isinstance(c, dict)]
    if len(cards) != len(doc["cards"]):
        raise ValidationError("Each card must be an object.", field="cards")
    return Quote(customer=doc.get("customer") or "", cards=cards, name=doc.get("name"),
                 settlement=doc.get("settlement", "total"), path=path)


def load(path: str | Path) -> Quote:
    p = Path(path)
    return parse(p.read_text(encoding="utf-8"), p)


def validate(quote: Quote) -> list[dict[str, Any]]:
    """Offline: no browser, no network. Every error names the card and field and the legal values."""
    errors: list[dict[str, Any]] = []

    def bad(card: Any, field_: str, message: str, **extra: Any) -> None:
        errors.append({"card": card.get("id"), "field": field_, "error": message, **extra})

    if not quote.customer.strip():
        errors.append({"card": None, "field": "customer", "error": "customer is required."})
    for card in quote.cards:
        for name in ("id", "service", "region", "billing"):
            if not card.get(name):
                bad(card, name, f"{name} is required (a card or the file's defaults must set it).")
        if unknown := sorted(set(card) - CARD_FIELDS):
            bad(card, unknown[0], f"Unknown card field {unknown[0]!r}.", allowed=sorted(CARD_FIELDS))
        service = str(card.get("service", "")).lower()
        try:
            builder = get_builder(service, tools.calc)
        except Exception:  # noqa: BLE001 - unknown service
            from autocalc.services import VERIFIED
            bad(card, "service", f"No service {service!r}.", allowed=sorted(VERIFIED))
            continue
        if card.get("billing") and card["billing"] not in builder.modes:
            bad(card, "billing", f"{service} does not support {card['billing']!r}.", allowed=list(builder.modes))
        if not card.get("spec") and not card.get("needs") and builder.spec_arg:
            bad(card, "spec", "Give the size (`needs`) or a specific `spec`.", hint="needs: {vcpus: 4, memory_gb: 16}")
        schema = generate.load_service(service)
        controls = {c.option: c for c in schema.controls if c.option} if schema else {}
        legal = sorted(builder.options())
        if not isinstance(card.get("options") or {}, dict):
            bad(card, "options", "options must be a mapping of option name to value.", allowed=legal)
            continue
        for option, value in (card.get("options") or {}).items():
            if option not in legal:
                bad(card, option, f"{service} has no option {option!r}.", allowed=legal, hint=SCHEMA_HINT)
            elif (c := controls.get(option)) and isinstance(value, (int, float)) and not isinstance(value, bool):
                for r in (r for r in c.ranges if r.when is None):
                    if (r.min is not None and value < r.min) or (r.max is not None and value > r.max):
                        bad(card, option, f"{value} is outside the range {_g(r.min)}..{_g(r.max)} {r.unit or ''}".strip(),
                            range={"min": r.min, "max": r.max, "step": r.step}, hint=SCHEMA_HINT)
    return errors


def _g(v: float | None) -> str:
    return "" if v is None else f"{v:g}"


def unmapped_options(card: dict[str, Any]) -> list[str]:
    """Options the card sets that no control in the service's schema maps."""
    schema = generate.load_service(str(card["service"]).lower())  # validate() has already vetted the id
    mapped = {c.option for c in schema.controls if c.option} if schema else set()
    return sorted(set(card.get("options") or {}) - mapped)


def _lock_path(quote: Quote) -> Path | None:
    return quote.path.with_suffix(".lock.json") if quote.path else None


def _read_lock(quote: Quote) -> dict[str, Any]:
    p = _lock_path(quote)
    return json.loads(p.read_text(encoding="utf-8")) if p and p.exists() else {}


def _raise_if_invalid(quote: Quote) -> None:
    if errors := validate(quote):
        first = errors[0]
        legal = first.get("allowed") or first.get("range")
        hint = (f"Legal {first['field']}: {legal}. " if legal else "") + SCHEMA_HINT
        raise ValidationError(f"Card {first['card']!r}: {first['error']}", field=first["field"],
                              allowed=first.get("allowed"), hint=hint, details={"errors": errors})


def plan(quote: Quote) -> dict[str, Any]:
    """Validate, resolve through the ranking, rate. Saves nothing on the website; writes the lock file."""
    from autocalc import workflow
    from autocalc.core.ranking import rank
    from autocalc.providers.huawei import HuaweiProvider
    _raise_if_invalid(quote)
    lock = _read_lock(quote)
    cards = [{**c, **({"spec": lock[c["id"]]["spec"]} if c["id"] in lock and not c.get("spec") else {})}
             for c in quote.cards]
    view = workflow.draft_quote(quote.customer, cards)
    provider = HuaweiProvider(tools.calc)
    from autocalc.core import DraftStore
    draft = DraftStore().load(view["draft_id"])
    decided = {d.requirement_id: d for d in draft.decisions}
    rows, new_lock = [], dict(lock)
    for card, req in zip(quote.cards, draft.requirements, strict=True):
        row: dict[str, Any] = {"id": card["id"], "unmapped_options": unmapped_options(card)}
        if d := decided.get(req.id):
            price = next((str(x.candidate.price) for x in rank(req, provider.candidates(req))
                          if x.candidate.spec == d.spec), None)
            row |= {"spec": d.spec, "price": price}
            pinned = lock.get(card["id"])
            if pinned and pinned.get("price") != price:
                row["lock_drift"] = {"locked_price": pinned.get("price"), "price": price}
            elif not pinned:
                new_lock[card["id"]] = {"spec": d.spec, "price": price}
        else:
            row["candidates"] = next(r for r in view["requirements"] if r["id"] == req.id)["candidates"]
        rows.append(row)
    if (p := _lock_path(quote)) and new_lock != lock:
        p.write_text(json.dumps(new_lock, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {"draft_id": view["draft_id"], "cards": rows, "pending": view["pending"]}


def apply(quote: Quote, name: str | None = None) -> dict[str, Any]:
    """Plan, then publish through the fail-closed gate. Refuses unresolved cards and unmapped options."""
    from autocalc import workflow
    result = plan(quote)
    if result["pending"]:
        raise ValidationError(f"Card {result['pending'][0]!r} is unresolved; choose a spec with `spec:` in the file.",
                              field="spec", allowed=result["pending"])
    for row in result["cards"]:
        if row["unmapped_options"]:
            raise ValidationError(f"Card {row['id']!r} sets options the schema does not map: {row['unmapped_options']}.",
                                  field=row["unmapped_options"][0], hint=SCHEMA_HINT)
        if "lock_drift" in row:
            raise ValidationError(f"Card {row['id']!r} changed price since the lock was written; review and delete its "
                                  "lock entry to accept.", field="spec", allowed=[row["lock_drift"]["price"]])
    title = name or quote.name
    if not title:
        raise ValidationError("A list name is required (`name:` in the file).", field="name")
    return workflow.publish_quote(result["draft_id"], title, settlement=quote.settlement)


@tools.tool
def plan_quote(path: str) -> dict[str, Any]:
    """Plan a quote file (YAML of cards): validate it against the service schemas, resolve each card to a spec,
    rate it and report options the schema does not map and price changes since the lock file. Saves nothing
    on the website. Read the schema first: resource autocalc://schema/<service>. Sizes in GB, bandwidth in Mbit/s."""
    return plan(load(path))


@tools.tool
def apply_quote(path: str, name: str = "") -> dict[str, Any]:
    """Publish a planned quote file through the verified publish gate and return the share link.

    Needs a login (auth_login). Fails on an unresolved card, an option the schema does not map or a moved price."""
    return apply(load(path), name or None)
