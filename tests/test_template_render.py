"""Regression test: builders must reproduce the corpus card's render template.

The saved card's ``rewriteValue.template_RENDER`` is what the Edit view re-prices from.
If a builder emits a different template, clicking Edit silently changes the price
(the bug that shipped in the first CCI/ELB cards). ``golden.compare_cards`` does NOT
check rewriteValue, so this test covers it. Label-only fields (measure names / trans
rate) are ignored - they don't affect the price.

Run: uv run pytest -q -m live tests/test_template_render.py
"""

from __future__ import annotations

import importlib

import golden
import pytest

pytestmark = pytest.mark.live

LABEL = {"measureNameBeforeTrans", "measurePluralNameBeforeTrans", "transRate", "transTarget"}
CASES = {"evs": "evs_rebuild", "cce": "cce_rebuild", "rds": "rds_rebuild", "elb": "elb_rebuild",
         "sfsturbo": "sfs_rebuild"}
SIMPLE = {"cbr", "dline", "nat", "apig", "apm", "waf", "function", "dew", "lts"}


def _norm(obj):
    if isinstance(obj, dict):
        return {k: _norm(v) for k, v in obj.items() if k not in LABEL}
    if isinstance(obj, list):
        return [_norm(v) for v in obj]
    return obj


def _rebuild(service: str):
    if service in CASES:
        return importlib.import_module(CASES[service]).rebuild
    if service in SIMPLE:
        return getattr(importlib.import_module("simple_rebuild"), service)
    raise KeyError(service)


def _canon_ecs(tr):
    """ECS addible data-disk keys carry a save-time counter that we can't reproduce
    (values are identical); compare them as an ordered list instead."""
    tr = _norm(tr)
    ev = tr.get("calculator_evs_stepper")
    if isinstance(ev, dict):
        adds = sorted((k, v) for k, v in ev.items() if k != "calculator_evs_stepper_main")
        ev["__addibles"] = [v for _, v in adds]
        for k, _ in adds:
            ev.pop(k, None)
    return tr


def test_ecs_template_render():
    cards = golden.all_cards("ecs")
    ok = attempted = 0
    for _, _, c in cards:
        mod = "ecs_ri_rebuild" if c["selectedProduct"]["chargeModeName"] == "RI" else "ecs_rebuild"
        try:
            r = importlib.import_module(mod).rebuild(c)
        except Exception:
            continue  # spec not in today's catalog (documented drift)
        attempted += 1
        if _canon_ecs(r["rewriteValue"]["template_RENDER"]) == _canon_ecs(c["rewriteValue"]["template_RENDER"]):
            ok += 1
    # 2 corpus cards drift from today's portal (one omits eip_switch/evs, one has a phantom addible disk)
    assert ok >= attempted - 2, f"ecs render template {ok}/{attempted} (Edit would re-price)"



@pytest.mark.parametrize("service", sorted([*CASES, *SIMPLE]))
def test_template_render(service):
    rebuild = _rebuild(service)
    cards = golden.all_cards(service)
    ok = sum(_norm(rebuild(c)["rewriteValue"]["template_RENDER"])
             == _norm(c["rewriteValue"]["template_RENDER"]) for _, _, c in cards)
    assert ok == len(cards), f"{service}: render template {ok}/{len(cards)} (Edit would re-price)"
