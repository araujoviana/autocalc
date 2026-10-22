"""Scan a saved calculator list for rendering glitches.

Catches the class of bugs that surface in the UI as NaN / undefined / wrong totals:

* non-finite numbers anywhere (the NaN the calculator showed came from RI cards
  missing their selected-level aggregates),
* money fields that are missing or not numbers,
* RI cards that do not carry ``perAmount``/``installAmount``/... at the selected level,
* a card total that disagrees with the sum of its products,
* a list total that disagrees with the sum of its cards,
* products with a non-positive ``productNum`` or a broken ``selectIndex`` sequence.
"""

from __future__ import annotations

import math
from typing import Any

MONEY = ("amount", "originalAmount", "discountAmount", "perAmount",
         "perDiscountAmount", "perOriginalAmount", "installAmount")
RI_SELECTED = ("perAmount", "installAmount", "perDiscountAmount", "perOriginalAmount")
REQUIRED_SELECTED = ("region", "chargeMode", "chargeModeName", "serviceCode", "productAllInfos", "amount", "originalAmount")
REQUIRED_SKU = ("resourceSpecCode", "resourceType", "productNum", "inquiryTag", "selectIndex", "addToList_product")
# image/companion lines (RI cards) are pinned to the card but are not SKU-priced
REQUIRED_COMPANION = ("inquiryTag", "productNum", "selectIndex", "addToList_product")
PLACEHOLDERS = ("nan", "undefined", "infinity", "-inf")
# ECS public-IP form state: the calculator stores these label tokens (see
# docs/explanation/huawei/edit-vs-list-price.md). Edit fills any gap with "assign an EIP".
EIP_ASSIGN = "calc_14_"
EIP_NONE = "calc_15_"


def _walk(obj: Any, path: str = ""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _walk(v, f"{path}.{k}" if path else str(k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _walk(v, f"{path}[{i}]")
    else:
        yield path, obj


def _nonfinite(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, float):
        return math.isnan(value) or math.isinf(value)
    return isinstance(value, str) and value.strip().lower() in PLACEHOLDERS


def scan_nonfinite(obj: Any) -> list[str]:
    return [f"{p}: {v!r} is not a finite value" for p, v in _walk(obj) if _nonfinite(v)]


def check_ecs_public_ip(sp: dict[str, Any], rewrite: dict[str, Any], tag: str) -> list[str]:
    """Edit rebuilds the public-IP choice from the form state alone, so it must agree with the products."""
    form = (rewrite.get("template_RENDER") or {})
    switch = (form.get("calculator_eip_switch") or {}).get("UNSET_Switch")
    has_radio = isinstance(form.get("calculator_eip_radio"), dict)
    has_bandwidth = any(str(p.get("resourceType", "")).endswith("bandwidth") for p in sp.get("productAllInfos") or [])
    if not has_bandwidth and switch != EIP_NONE:
        return [f"[{tag}] no bandwidth product but the form state does not say 'no public IP' "
                f"(switch={switch!r}); Edit will add the default EIP"]
    if has_bandwidth and switch == EIP_NONE:
        return [f"[{tag}] bandwidth product present but the form state says 'no public IP'"]
    if has_bandwidth and not has_radio:
        return [f"[{tag}] bandwidth product present but the EIP bandwidth form state is missing; "
                f"Edit will use the default bandwidth"]
    return []


def validate_list(data: dict[str, Any]) -> dict[str, Any]:
    """Return ``{ok, items, total, issues}`` for a share payload or ``share/detail`` body."""
    issues = scan_nonfinite(data)
    items = data.get("cartListData") or data.get("items") or ([data] if "selectedProduct" in data else [])
    total = 0.0

    for i, it in enumerate(items):
        sp = it.get("selectedProduct") or {}
        tag = sp.get("_customTitle") or sp.get("serviceCode") or f"item {i}"
        for k in REQUIRED_SELECTED:
            if k not in sp:
                issues.append(f"[{tag}] selectedProduct.{k} missing")
        prods = sp.get("productAllInfos") or []
        if not prods:
            issues.append(f"[{tag}] has no products")

        s = 0.0
        idxs: list[int] = []
        for p in prods:
            spec = p.get("resourceSpecCode") or p.get("name") or p.get("id") or "?"
            required = REQUIRED_SKU if "resourceSpecCode" in p else REQUIRED_COMPANION
            for k in required:
                if k not in p:
                    issues.append(f"[{tag}] product {spec}: {k} missing")
            pn = p.get("productNum")
            if not isinstance(pn, (int, float)) or _nonfinite(pn) or pn <= 0:
                issues.append(f"[{tag}] product {spec}: productNum {pn!r} invalid")
            if isinstance(p.get("selectIndex"), int):
                idxs.append(p["selectIndex"])
            ir = p.get("inquiryResult")
            if not ir:
                issues.append(f"[{tag}] product {spec}: no inquiryResult")
                continue
            if not isinstance(ir.get("amount"), (int, float)) or _nonfinite(ir.get("amount")):
                issues.append(f"[{tag}] product {spec}: inquiryResult.amount {ir.get('amount')!r} invalid")
            else:
                s += ir["amount"]
            if not isinstance(ir.get("originalAmount"), (int, float)) or _nonfinite(ir.get("originalAmount")):
                issues.append(f"[{tag}] product {spec}: inquiryResult.originalAmount {ir.get('originalAmount')!r} invalid")

        got = sp.get("amount")
        if not isinstance(got, (int, float)) or _nonfinite(got):
            issues.append(f"[{tag}] selectedProduct.amount {got!r} invalid")
        elif abs(got - s) > 0.02:
            issues.append(f"[{tag}] card amount {got} != sum(products) {round(s, 6)}")
        if idxs and idxs != list(range(len(prods))):
            issues.append(f"[{tag}] selectIndex not 0..n-1: {idxs}")
        if sp.get("serviceCode") == "ecs":
            issues.extend(check_ecs_public_ip(sp, it.get("rewriteValue") or {}, tag))
        if sp.get("chargeModeName") == "RI":
            for k in RI_SELECTED:
                if k not in sp:
                    issues.append(f"[{tag}] RI card missing selected-level {k}")

        if isinstance(got, (int, float)) and not _nonfinite(got):
            total += got

    tp = data.get("totalPrice")
    tp = tp.get("amount") if isinstance(tp, dict) else tp
    if tp is not None and abs(tp - total) > 0.02:
        issues.append(f"totalPrice {tp} != sum(items) {round(total, 6)}")

    return {"ok": not issues, "items": len(items), "total": round(total, 6), "issues": issues}
