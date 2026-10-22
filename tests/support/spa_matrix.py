"""Proof harness for the seven services (spa-encoder): page-built cards are Edit-faithful.

For each service and billing mode in MATRIX it builds the options with the Python builder,
replays the builder's form state on the calculator page, saves all page cards as one list on
your account, re-reads it anonymously, and prints the stored, Edit and rating amounts per card.
The list is deleted at the end. Exit code 0 only if every card's three amounts agree.

Needs a login (`autocalc login`), because it saves a list.

Run:  uv run python -m tests.support.spa_matrix
"""

from __future__ import annotations

import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx

from autocalc.client import Calculator
from autocalc.errors import CalculatorError
from autocalc.gate import rerate
from autocalc.page.edit_check import EditResult, detail_cards, edit_check
from autocalc.page.replay import encode_card
from autocalc.page.store import cents, frontend_version
from autocalc.services import build
from autocalc.services.base import Builder
from autocalc.services.forms import RECIPES
from autocalc.share import Session, share_detail

REGION = "sa-brazil-1"
RDS = dict(flavor="rds.pg.n1.large.4", storage_spec="rds.pg.volume.cloudssd", storage_gb=160, db_version="dataInfo_107_")
ECS = dict(flavor="c7n.large.2", image="Ubuntu", data_disks=[("GPSSD", 50)], bandwidth_mbit=5)
# sizes SFS Turbo's own form accepts: 3.6 TB and up, in steps of 1.2 TB
MATRIX: list[tuple[str, str, dict[str, Any]]] = [
    ("ecs", "monthly", ECS),
    ("evs", "ondemand", dict(type="GPSSD", size_gb=100)),
    ("evs", "monthly", dict(type="GPSSD", size_gb=100)),
    ("evs", "yearly", dict(type="GPSSD", size_gb=100)),
    ("cce", "ondemand", {}),
    ("cce", "yearly", dict(ha=False)),
    ("elb", "ondemand", {}),
    ("elb", "yearly", {}),
    # OBS pay-per-use usage cards are left out: the page's Edit view resets their size stepper to 0,
    # for the builder's card and the page's alike, so the publish gate refuses them (page-encoder.md).
    ("obs", "monthly", dict(package="200tb")),
    ("obs", "yearly", dict(package="50tb")),
    ("rds", "ondemand", RDS),
    ("rds", "yearly", RDS),
    ("sfsturbo", "ondemand", dict(size_gb=3686)),
    ("sfsturbo", "yearly", dict(size_gb=3686)),
]
# builder-wave-1: the thirteen services whose builders existed before the page encoder
WAVE1: list[tuple[str, str, dict[str, Any]]] = [
    ("apig", "ondemand", {}),
    ("apm", "ondemand", {}),
    *[("cbr", b, {}) for b in ("ondemand", "monthly", "yearly")],
    ("cci", "ondemand", {}),
    ("dew", "ondemand", {}),
    *[("dline", b, {}) for b in ("monthly", "yearly")],
    # usage above the free tier: the page will not add a zero-price card
    ("function", "ondemand", dict(requests=20_000_000, gb_seconds=10_000_000, memory_mb=512)),
    *[("kafka", b, {}) for b in ("ondemand", "monthly", "yearly")],
    ("lts", "ondemand", dict(flow_gb=10, index_gb=10)),
    ("nat", "ondemand", {}),
    *[("nosql", b, {}) for b in ("ondemand", "monthly", "yearly")],
    *[("rabbitmq", b, {}) for b in ("ondemand", "monthly", "yearly")],
    ("waf", "ondemand", {}),
]
MATRIX += WAVE1
# form recipes (services/forms.py): the page's defaults, in every billing mode
WAVE2 = [(svc, b, {}) for svc, r in RECIPES.items() for b in r.modes]
NONZERO = {("er", "ondemand"): dict(downflow_gb=100, attachment_hours=730, attachments=2),
           ("cbh", "monthly"): dict(edition="dataInfo_1_"), ("cbh", "yearly"): dict(edition="dataInfo_1_"),
           ("ssa", "monthly"): dict(edition="dataInfo_1_"), ("ssa", "yearly"): dict(edition="dataInfo_1_"),
           ("sfs", "ondemand"): dict(capacity_gb=100)}  # a default that prices at zero proves nothing
WAVE2 = [(s, b, NONZERO.get((s, b), o)) for s, b, o in WAVE2]
MATRIX += WAVE2
# SPA_ONLY=nat,waf runs just those services
_ONLY = set(filter(None, os.environ.get("SPA_ONLY", "").split(",")))
if _ONLY:
    MATRIX = [m for m in MATRIX if m[0] in _ONLY]
LIST_PREFIX = "autocalc-poc-"
CALCULATOR_PAGE = "https://www.huaweicloud.com/intl/en-us/pricing/calculator.html"


def encode_all(calc: Calculator) -> list[dict[str, Any] | str]:
    """One page card per matrix entry, or the reason it could not be encoded."""
    def one(entry):
        service, billing, options = entry
        try:
            card = build(service, calc, region=REGION, billing=billing, **options)
            return encode_card(service, card["rewriteValue"])
        except CalculatorError as exc:
            return f"{exc.code}: {str(exc).splitlines()[0]}"

    with ThreadPoolExecutor(max_workers=3) as pool:  # isolated contexts (ADR-0010)
        return list(pool.map(one, MATRIX))


def report(rows: list[tuple[str, Any, Any, EditResult]], version: str | None) -> bool:
    print(f"\nfrontend CBC-PortalCalculator/{version}, region {REGION}")
    print(f"{'card':<20} {'stored':>12} {'edit':>12} {'rating':>12}  result")
    ok = True
    for name, stored, rating, r in rows:
        good = r.equal and stored == rating
        ok &= good
        note = "" if good else f"  ({r.reason or 'rating differs'})"
        warn = "  [page showed its 'No data matched' dialog]" if r.warning else ""
        print(f"{name:<20} {stored!s:>12} {r.edit!s:>12} {rating!s:>12}  {'PASS' if good else 'FAIL'}{note}{warn}")
    return ok


def main() -> int:
    calc = Calculator()
    version = frontend_version([httpx.get(CALCULATOR_PAGE, timeout=20, follow_redirects=True).text])
    t0 = time.monotonic()
    encoded = encode_all(calc)
    print(f"encoded {len(encoded)} cards on the page in {time.monotonic() - t0:.1f} s")
    failed = [(f"{s}/{b}", e) for (s, b, _), e in zip(MATRIX, encoded, strict=True) if isinstance(e, str)]
    for name, why in failed:
        print(f"ENCODE FAIL {name}: {why}")
    names = [f"{s}/{b}" for (s, b, _), e in zip(MATRIX, encoded, strict=True) if not isinstance(e, str)]
    cards = [e for e in encoded if not isinstance(e, str)]

    session = Session()
    list_id = session.create(Builder.share_payload(f"{LIST_PREFIX}{int(time.time())}", cards))
    try:
        stored = detail_cards(share_detail(calc, list_id))
        results = edit_check(list_id, calc)
        rows = [(n, cents(c["selectedProduct"]["amount"]), rerate(c, calc), r)
                for n, c, r in zip(names, stored, results, strict=False)]
        ok = report(rows, version) and not failed
    finally:
        session.delete(list_id)
        left = [x for x in session.lists() if str(x.get("name", "")).startswith(LIST_PREFIX)]
        print(f"deleted the list; {len(left)} {LIST_PREFIX}* list(s) remain")
    print("SPA ENCODER MATRIX:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
