"""Audit: does every builder reproduce the corpus card's rewriteValue (render template)?

Golden tests compare productAllInfos/amount but NOT rewriteValue, which is what the
Edit view re-prices from. This script rebuilds each corpus card and diffs rewriteValue
so template gaps (the "price changes on Edit" bug) surface per service.

Run: cd ~/code/autocalc && .venv/bin/python tests/template_audit.py [per_service_limit]
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import golden  # noqa: E402

SIMPLE = ["nat", "apig", "dline", "cbr", "apm", "waf", "function", "dew", "lts"]
MODULES = {"evs": "evs_rebuild", "cce": "cce_rebuild", "obs": "obs_rebuild", "rds": "rds_rebuild",
           "elb": "elb_rebuild", "sfsturbo": "sfs_rebuild"}


def diff_paths(a, b, path="", out=None, limit=6):
    out = out if out is not None else []
    if len(out) >= limit:
        return out
    if type(a) is not type(b):
        out.append(f"{path}: rebuilt={a!r} corpus={b!r}")
    elif isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if a.get(k) != b.get(k):
                diff_paths(a.get(k), b.get(k), f"{path}/{k}", out, limit)
    elif isinstance(a, list):
        if len(a) != len(b):
            out.append(f"{path}: len rebuilt={len(a)} corpus={len(b)}")
        else:
            for i, (x, y) in enumerate(zip(a, b, strict=True)):
                diff_paths(x, y, f"{path}[{i}]", out, limit)
    elif a != b:
        out.append(f"{path}: rebuilt={a!r} corpus={b!r}")
    return out


def rebuild_for(service, card):
    if service == "ecs":
        mod = "ecs_ri_rebuild" if card["selectedProduct"]["chargeModeName"] == "RI" else "ecs_rebuild"
        return importlib.import_module(mod).rebuild
    if service in MODULES:
        return importlib.import_module(MODULES[service]).rebuild
    if service in SIMPLE:
        return getattr(importlib.import_module("simple_rebuild"), service)
    return None


def main(limit=8):
    by_svc: dict[str, list] = {}
    for key, idx, card in golden.all_cards():
        by_svc.setdefault(card["selectedProduct"]["serviceCode"], []).append((key, idx, card))
    print(f"services in corpus: {sorted(by_svc)}\n")
    for svc in sorted(by_svc):
        fn = rebuild_for(svc, by_svc[svc][0][2])
        if fn is None:
            print(f"{svc:<10} NO REBUILD HELPER")
            continue
        cards = by_svc[svc][:limit]
        rw_ok = prod_ok = err = 0
        sample: list[str] = []
        for _key, _idx, card in cards:
            try:
                rebuilt = fn(card)
            except Exception as exc:  # noqa: BLE001
                err += 1
                if not sample:
                    sample.append(f"BUILD ERR {type(exc).__name__}: {exc}")
                continue
            if rebuilt.get("rewriteValue") == card.get("rewriteValue"):
                rw_ok += 1
            elif not sample:
                sample = diff_paths(rebuilt.get("rewriteValue"), card.get("rewriteValue"), "rewriteValue", [], 8)
            if golden.compare_cards(rebuilt, card)["ok"]:
                prod_ok += 1
        flag = "OK " if rw_ok == len(cards) else "**"
        print(f"{svc:<10} {flag} rewrite {rw_ok}/{len(cards)}  products {prod_ok}/{len(cards)}  err {err}")
        for s in sample:
            print(f"            {s}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 8)
