"""Region sweep: which verified service/mode combinations still work in other regions.

No login, nothing is saved. Tier 1 asks the catalog (is the service and mode sold in the region,
does it have priced candidates); tier 2 has the calculator page build the card and compares its
stored amount with the rating engine's price for the same products. The Edit check is left out,
so a pass means "encodes and prices", not "verified"; sample Edit with spa_matrix.

Run:  SWEEP_REGIONS=eu-west-101,ap-southeast-1 uv run python -u -m tests.support.region_sweep
      SWEEP_ONLY=esw,eip ...      limits the services;  SWEEP_TIER1=1 skips the page
      SWEEP_WORKERS=8 ...         browser contexts in parallel (default 6; page-load timeouts are retried)
"""

from __future__ import annotations

import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from autocalc.availability import Availability
from autocalc.client import Calculator
from autocalc.errors import CalculatorError, PageEncodeFailed
from autocalc.gate import rerate
from autocalc.page.replay import encode_card
from autocalc.page.store import cents
from autocalc.services import build
from tests.support.spa_matrix import MATRIX

DEFAULT = "eu-west-101,ap-southeast-1,la-south-2"
REGIONS = [r for r in os.environ.get("SWEEP_REGIONS", DEFAULT).split(",") if r]
ONLY = set(filter(None, os.environ.get("SWEEP_ONLY", "").split(",")))
WORKERS = max(1, int(os.environ.get("SWEEP_WORKERS", "6")))
RATING = threading.BoundedSemaphore(4)  # ADR-0010: rating reads, at most 4 in flight


def encode(service: str, rewrite_value: dict, tries: int = 3) -> dict:
    """encode_card, retrying the load/settle timeouts that parallel contexts cause (not form mismatches)."""
    for n in range(tries):
        try:
            return encode_card(service, rewrite_value, timeout=10)  # a stuck load fails in 30 s, not 60
        except PageEncodeFailed as exc:
            if n == tries - 1 or exc.details.get("step") not in ("open", "price"):
                raise
            time.sleep(2 * 2**n)


def tier1(calc: Calculator, avail: Availability, service: str, region: str, billing: str) -> str | None:
    """Why the combination cannot be quoted in this region, or None."""
    try:
        avail.check_mode(service, region, billing)
    except CalculatorError as exc:
        return f"not sold: {str(exc).splitlines()[0]}"
    return None


def tier2(calc: Calculator, service: str, region: str, billing: str, options: dict) -> str:
    try:
        with RATING:
            card = build(service, calc, region=region, billing=billing, **options)
        page = encode(service, card["rewriteValue"])
        with RATING:
            stored, rated = cents(page["selectedProduct"]["amount"]), rerate(page, calc)
    except CalculatorError as exc:
        return f"FAIL {exc.code}: {str(exc).splitlines()[0][:110]}"
    except Exception as exc:  # a builder that does not know this region's catalog (e.g. a flavor not sold there)
        return f"FAIL {type(exc).__name__}: {str(exc).splitlines()[0][:110]}"
    if stored != rated:
        return f"FAIL stored {stored} != rated {rated}"
    return f"pass {stored}"


def main() -> int:
    calc, avail = Calculator(), Availability(Calculator())
    jobs = [(s, r, b, o) for r in REGIONS for s, b, o in MATRIX if not ONLY or s in ONLY]
    t0, rows = time.monotonic(), []
    todo = []
    for s, r, b, o in jobs:
        why = tier1(calc, avail, s, r, b)
        (rows.append((s, r, b, why)) if why else todo.append((s, r, b, o)))
    if not os.environ.get("SWEEP_TIER1"):
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:  # isolated browser contexts (ADR-0010)
            rows += [(s, r, b, res) for (s, r, b, _), res in
                     zip(todo, pool.map(lambda j: tier2(calc, j[0], j[1], j[2], j[3]), todo), strict=True)]
    else:
        rows += [(s, r, b, "sold (tier 1 only)") for s, r, b, _ in todo]
    print("| service | region | mode | result |\n|---|---|---|---|")
    for s, r, b, res in sorted(rows):
        print(f"| {s} | {r} | {b} | {res} |")
    bad = sum(res.startswith("FAIL") for *_, res in rows)
    print(f"\n{len(rows)} combinations, {bad} failed, {time.monotonic() - t0:.0f} s", file=sys.stderr)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
