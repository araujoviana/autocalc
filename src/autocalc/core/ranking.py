"""Rank candidates (ADR-0005): covers, then closest, then cheapest, then newest.

Only an exact top match may be auto-confirmed; everything else goes to a human.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from autocalc.core.model import Candidate, Requirement

LABELS = {"vcpus": "vCPU", "memory_gb": "GB"}


@dataclass
class Ranked:
    candidate: Candidate
    covers: bool
    exact: bool
    reason: str


def _num(v: float) -> str:
    return f"{v:g}"


def _needs(req: Requirement) -> str:
    return "/".join(f"{_num(v)} {LABELS.get(k, k)}" for k, v in req.needs.items())


def _covers(req: Requirement, c: Candidate) -> bool:
    return all(k in c.has and c.has[k] >= v for k, v in req.needs.items())


def _closeness(req: Requirement, c: Candidate) -> float:
    return sum(abs(c.has.get(k, 0) - v) / v if v else c.has.get(k, 0) for k, v in req.needs.items())


def _is_exact(req: Requirement, c: Candidate, covers: bool) -> bool:
    if not (req.needs or req.spec) or not covers:
        return False
    return all(c.has[k] == v for k, v in req.needs.items()) and (req.spec is None or c.spec == req.spec)


def _money(v: Decimal) -> str:
    return format(v.normalize(), "f")


def rank(req: Requirement, candidates: list[Candidate]) -> list[Ranked]:
    rows = [(c, _covers(req, c)) for c in candidates]
    rows.sort(key=lambda r: (not r[1], _closeness(req, r[0]), bool(req.spec) and r[0].spec != req.spec,
                             r[0].price, -r[0].generation, r[0].spec))
    ranked = [Ranked(c, cov, _is_exact(req, c, cov), "") for c, cov in rows]
    exact = [r for r in ranked if r.exact]
    covering = [r for r in ranked if r.covers and not r.exact]
    for r in ranked:
        r.reason = _reason(req, r, exact, covering)
    return ranked


def _reason(req: Requirement, r: Ranked, exact: list[Ranked], covering: list[Ranked]) -> str:
    c = r.candidate
    if not r.covers:
        miss = [f"{_num(v)} {LABELS.get(k, k)} (has {_num(c.has[k]) if k in c.has else 'not stated'})"
                for k, v in req.needs.items() if k not in c.has or c.has[k] < v]
        return "misses " + ", ".join(miss)
    if r.exact:
        if len(exact) == 1:
            return f"covers {_needs(req) or 'named spec ' + c.spec}; exact match"
        if r is exact[0]:
            return f"covers {_needs(req) or 'named spec ' + c.spec}; cheapest of {len(exact)} exact matches"
        return f"exact match; {_money(c.price - exact[0].candidate.price)} above the cheapest exact match"
    extra = ", ".join(f"+{_num(c.has[k] - v)} {LABELS.get(k, k)}" for k, v in req.needs.items() if c.has[k] > v)
    why = f"covers {_needs(req)}" + (f" with {extra}" if extra else "")
    if req.spec and c.spec != req.spec:
        why += f"; not the named spec {req.spec}"
    if r is covering[0]:
        why += f"; closest of {len(covering)} covering"
    return why


def auto_confirmable(ranked: list[Ranked]) -> bool:
    return bool(ranked) and ranked[0].exact
