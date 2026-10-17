"""Proof harness for ADR-0001 (spa-encoder-poc, design D7): page-built ECS cards are Edit-faithful.

Encodes on-demand, monthly and 1-year RI ECS cards in sa-brazil-1 with the page encoder, saves
them as one list on your account, re-reads it anonymously, and prints the stored, Edit and
rating amounts per card, plus a field diff against the Python builder's card for the same
options. The list is deleted at the end. Exit code 0 only if every card's three amounts agree.

With --negative it also saves a known-bad card (the Python builder's monthly card with its
data-disk form entries removed, the bug that made a stored 10,480.39 re-price to 9,831.28) and
checks that the Edit check flags it. That control is reported separately and does not change
the exit code.

Needs a login (`autocalc login`), because it saves a list.

Run:  uv run python -m tests.support.spa_poc [--negative]
"""

from __future__ import annotations

import argparse
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx

from autocalc.client import Calculator
from autocalc.page.ecs import encode_ecs
from autocalc.page.edit_check import EditResult, detail_cards, edit_check
from autocalc.page.store import cents, frontend_version
from autocalc.services.base import Builder
from autocalc.services.ecs import EcsBuilder
from autocalc.share import Session, share_detail
from tests.support.page_rating import rerate

REGION = "sa-brazil-1"
OPTIONS = dict(flavor="c7n.large.2", image="Ubuntu", system_disk=("GPSSD", 40),
               data_disks=[("GPSSD", 50), ("GPSSD", 50)], bandwidth_mbit=5)
MATRIX = [("ondemand", {"hours": 730}), ("monthly", {}), ("ri", {"ri_time": "1_3"})]
IGNORE = {"timeTag", "_cartId"}
LIST_PREFIX = "autocalc-poc-"
CALCULATOR_PAGE = "https://www.huaweicloud.com/intl/en-us/pricing/calculator.html"


def diff(a: Any, b: Any, path: str = "") -> list[str]:
    """Paths where card ``a`` (page) and ``b`` (builder) differ, ignoring volatile keys."""
    if isinstance(a, dict) and isinstance(b, dict):
        out = []
        for k in sorted(set(a) | set(b)):
            if k in IGNORE or (k == "id" and path.endswith("inquiryResult")):
                continue
            sub = f"{path}.{k}" if path else k
            if k not in a or k not in b:
                out.append(f"{sub}: {'only builder' if k not in a else 'only page'}")
            else:
                out.extend(diff(a[k], b[k], sub))
        return out
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f"{path}: {len(a)} items on the page, {len(b)} from the builder"]
        return [d for i, (x, y) in enumerate(zip(a, b, strict=True)) for d in diff(x, y, f"{path}[{i}]")]
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return [] if float(a) == float(b) else [f"{path}: page {a!r}, builder {b!r}"]
    return [] if a == b else [f"{path}: page {a!r}, builder {b!r}"]


def encode_matrix(calc: Calculator) -> list[dict[str, Any]]:
    def one(entry):
        billing, extra = entry
        return encode_ecs(REGION, billing=billing, calc=Calculator(), **OPTIONS, **extra)

    with ThreadPoolExecutor(max_workers=len(MATRIX)) as pool:  # isolated contexts (ADR-0010)
        return list(pool.map(one, MATRIX))


def builder_cards(calc: Calculator) -> list[dict[str, Any]]:
    b = EcsBuilder(calc)
    return [b.build(region=REGION, billing=billing, **OPTIONS, **extra) for billing, extra in MATRIX]


def broken_card(calc: Calculator) -> dict[str, Any]:
    """The builder's monthly card without its addible data-disk render entries: Edit drops the disks."""
    card = EcsBuilder(calc).build(region=REGION, billing="monthly", **OPTIONS)
    evs = card["rewriteValue"]["template_RENDER"]["calculator_evs_stepper"]
    for key in [k for k in evs if "|addible0|" in k]:
        del evs[key]
    return card


def report(rows: list[tuple[str, Any, Any, EditResult]], version: str | None) -> bool:
    print(f"\nfrontend CBC-PortalCalculator/{version}, region {REGION}, {OPTIONS['flavor']}")
    print(f"{'card':<10} {'stored':>10} {'edit':>10} {'rating':>10}  result")
    ok = True
    for name, stored, rating, r in rows:
        good = r.equal and stored == rating
        ok &= good
        note = "" if good else f"  ({r.reason or 'rating differs'})"
        warn = "  [page showed its 'No data matched' dialog]" if r.warning else ""
        print(f"{name:<10} {stored!s:>10} {r.edit!s:>10} {rating!s:>10}  {'PASS' if good else 'FAIL'}{note}{warn}")
    return ok


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    ap.add_argument("--negative", action="store_true", help="also save a known-bad card and expect it to fail")
    args = ap.parse_args(argv)
    calc = Calculator()
    version = frontend_version([httpx.get(CALCULATOR_PAGE, timeout=20, follow_redirects=True).text])

    t0 = time.monotonic()
    page_cards = encode_matrix(calc)
    print(f"encoded {len(page_cards)} cards on the page in {time.monotonic() - t0:.1f} s")
    for (billing, _), page_card, py_card in zip(MATRIX, page_cards, builder_cards(calc), strict=True):
        d = diff(page_card, py_card)
        print(f"builder diff {billing}: {len(d)} field(s)" + "".join(f"\n  {x}" for x in d[:15])
              + (f"\n  ... {len(d) - 15} more" if len(d) > 15 else ""))

    session = Session()
    name = f"{LIST_PREFIX}{int(time.time())}"
    cards = page_cards + ([broken_card(calc)] if args.negative else [])
    list_id = session.create(Builder.share_payload(name, cards))
    try:
        stored = detail_cards(share_detail(calc, list_id))
        results = edit_check(list_id, calc)
        rows = [(billing, cents(card["selectedProduct"]["amount"]), rerate(card, calc), r)
                for (billing, _), card, r in zip(MATRIX, stored, results, strict=False)]
        ok = report(rows, version)
        if args.negative:
            neg = results[len(MATRIX)]
            print(f"negative control (disks dropped from the form state): stored {neg.stored}, edit {neg.edit} -> "
                  + ("DETECTED: " + str(neg.reason) if not neg.equal else "NOT DETECTED (the Edit check missed it)"))
    finally:
        session.delete(list_id)
        left = [x for x in session.lists() if str(x.get("name", "")).startswith(LIST_PREFIX)]
        print(f"deleted the list; {len(left)} {LIST_PREFIX}* list(s) remain")
    print("SPA ENCODER POC:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
