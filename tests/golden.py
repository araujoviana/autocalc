"""Golden-test harness (B0.4).

The corpus in ``tests/fixtures/corpus`` holds real saved lists pulled through the
anonymous ``share/detail`` endpoint. Each fixture is a card. A golden test
rebuilds the card from its *high-level options* and compares the result to the
stored card, ignoring volatile keys.

Volatile keys (always ignored): timeTag, _cartId, inquiryResult.id.
Catalog-drift keys (soft warning): prices of image entries, min_ram...
"""

from __future__ import annotations

import glob
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

CORPUS = Path(__file__).resolve().parent / "fixtures" / "corpus"
IGNORE_KEYS = {"timeTag", "_cartId"}
IGNORE_INQUIRY = {"id"}


def load_index() -> list[dict[str, Any]]:
    return json.loads((CORPUS / "index.json").read_text())


def load_list(key: str) -> dict[str, Any]:
    return json.loads((CORPUS / f"{key}.json").read_text())


def all_cards(service: str | None = None) -> list[tuple[str, int, dict[str, Any]]]:
    """Yield (list_key, item_index, card) for every card, optionally filtered by service."""
    out = []
    for f in sorted(glob.glob(str(CORPUS / "*.json"))):
        if f.endswith("index.json"):
            continue
        key = Path(f).stem
        d = json.loads(Path(f).read_text())
        for i, it in enumerate(d.get("cartListData") or []):
            if service and (it.get("selectedProduct") or {}).get("serviceCode") != service:
                continue
            out.append((key, i, it))
    return out


def _clean(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items() if k not in IGNORE_KEYS}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    return obj


def compare_products(a: dict[str, Any], b: dict[str, Any]) -> list[str]:
    """Compare two productAllInfos entries; return human-readable mismatches."""
    diffs = []
    keys = set(a) | set(b)
    for k in sorted(keys):
        va, vb = a.get(k), b.get(k)
        if k == "inquiryResult":
            va, vb = _clean(va or {}), _clean(vb or {})
        if k in IGNORE_KEYS:
            continue
        if va != vb:
            diffs.append(f"{k}: rebuilt={va!r} corpus={vb!r}")
    return diffs


def compare_cards(rebuilt: dict[str, Any], corpus: dict[str, Any],
                  product_keys: tuple[str, ...] = ("resourceSpecCode", "resourceType", "productNum",
                                                   "resourceSize", "usageFactor", "usageValue",
                                                   "addToList_title", "addToList_product", "billingMode",
                                                   "cloudServiceType", "inquiryTag", "selectIndex")) -> dict[str, Any]:
    """Compare rebuilt vs corpus card. Returns {ok, diffs, price_ok}."""
    rs, cs = rebuilt["selectedProduct"], corpus["selectedProduct"]
    diffs: list[str] = []
    for k in ("serviceCode", "region", "chargeMode", "chargeModeName", "periodType", "periodNum"):
        if rs.get(k) != cs.get(k):
            diffs.append(f"selected.{k}: rebuilt={rs.get(k)!r} corpus={cs.get(k)!r}")
    ra, ca = rs.get("amount"), cs.get("amount")
    if ra is None or ca is None or abs(ra - ca) > 0.01:
        diffs.append(f"selected.amount: rebuilt={ra} corpus={ca}")
    rp, cp = rs.get("productAllInfos") or [], cs.get("productAllInfos") or []
    if len(rp) != len(cp):
        diffs.append(f"product count: rebuilt={len(rp)} corpus={len(cp)}")
    for i, (a, b) in enumerate(zip(rp, cp, strict=False)):
        for k in product_keys:
            if a.get(k) != b.get(k):
                diffs.append(f"[{i}].{k}: rebuilt={a.get(k)!r} corpus={b.get(k)!r}")
        ia, ib = (a.get("inquiryResult") or {}).get("amount"), (b.get("inquiryResult") or {}).get("amount")
        if ia is not None and ib is not None and abs(ia - ib) > 0.01:
            diffs.append(f"[{i}].amount: rebuilt={ia} corpus={ib}")
    return {"ok": not diffs, "diffs": diffs,
            "price_ok": ra is not None and ca is not None and abs(ra - ca) <= 0.01}


def run_golden(service: str, rebuild: Callable[[dict[str, Any]], dict[str, Any]],
               limit: int | None = None, verbose: bool = False) -> dict[str, Any]:
    cards = all_cards(service)
    if limit:
        cards = cards[:limit]
    ok = 0
    fails: list[dict[str, Any]] = []
    errors = 0
    for key, idx, card in cards:
        try:
            rebuilt = rebuild(card)
        except Exception as exc:  # noqa: BLE001
            errors += 1
            fails.append({"key": key, "idx": idx, "error": f"{type(exc).__name__}: {exc}"})
            continue
        res = compare_cards(rebuilt, card)
        if res["ok"]:
            ok += 1
        else:
            fails.append({"key": key, "idx": idx, "diffs": res["diffs"][:12],
                          "spec": (card["selectedProduct"]["productAllInfos"][0].get("resourceSpecCode"))})
            if verbose:
                print(f"  FAIL {key}[{idx}]: {res['diffs'][:6]}")
    return {"service": service, "total": len(cards), "ok": ok, "failed": len(fails), "errors": errors,
            "rate": round(ok / len(cards), 3) if cards else 0.0, "fails": fails}
