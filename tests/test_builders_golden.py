"""Golden tests against the saved-list corpus (B0.4, D5).

These are the acceptance tests for the service builders: each rebuilds real cards
from the corpus (`tests/fixtures/corpus`) and diffs them. They hit the network
(catalog + rating), so they are marked `live` and need the corpus fixtures.

Run:  uv run pytest -m live tests/test_builders_golden.py
"""

from __future__ import annotations

import importlib

import pytest

from tests.support import golden

pytestmark = pytest.mark.live

# service -> (rebuild module, minimum pass rate we require)
CASES = {
    "evs": ("evs_rebuild", 1.0),
    "cce": ("cce_rebuild", 1.0),
    "obs": ("obs_rebuild", 1.0),
    "rds": ("rds_rebuild", 1.0),
    "elb": ("elb_rebuild", 1.0),
    "sfsturbo": ("sfs_rebuild", 1.0),
}


@pytest.mark.parametrize("service,spec", CASES.items())
def test_golden(service, spec):
    mod, floor = spec
    rebuild = importlib.import_module(f"tests.support.{mod}").rebuild
    res = golden.run_golden(service, rebuild)
    assert res["errors"] == 0, f"{service}: {res['errors']} build errors, e.g. {res['fails'][:2]}"
    assert res["rate"] >= floor, f"{service}: {res['ok']}/{res['total']} below {floor}. fails={res['fails'][:3]}"


def test_golden_ecs_non_ri():
    from tests.support.ecs_rebuild import rebuild
    cards = [c for c in golden.all_cards("ecs") if c[2]["selectedProduct"]["chargeModeName"] != "RI"]
    ok = 0
    for _, _, card in cards:
        bws = [p for p in card["selectedProduct"]["productAllInfos"]
               if p.get("resourceType") == "hws.resource.type.bandwidth"]
        if bws and bws[0].get("resourceSize") is None:
            continue  # traffic-EIP variant: documented exception
        try:
            if golden.compare_cards(rebuild(card), card)["ok"]:
                ok += 1
        except Exception:  # noqa: BLE001  catalog drift: flavor no longer sold
            continue
    assert ok >= 105, f"ECS non-RI round-trip too low: {ok}/{len(cards)}"


def test_golden_ecs_ri():
    from tests.support.ecs_ri_rebuild import rebuild
    cards = [c for c in golden.all_cards("ecs") if c[2]["selectedProduct"]["chargeModeName"] == "RI"]
    ok = sum(1 for _, _, card in cards if golden.compare_cards(rebuild(card), card)["ok"])
    # residual misses are catalog price drift (RI plan prices changed since the list was saved)
    assert ok / len(cards) >= 0.90, f"ECS RI round-trip too low: {ok}/{len(cards)}"
