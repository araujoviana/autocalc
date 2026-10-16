"""Rebuild an ELB card from its high-level options (golden test)."""

from __future__ import annotations

from typing import Any

from autocalc.services.elb import ElbBuilder


def options(card: dict[str, Any]) -> dict[str, Any]:
    sp = card["selectedProduct"]
    p = sp["productAllInfos"][0]
    billing = {"MONTHLY": "monthly", "YEARLY": "yearly", "ONDEMAND": "ondemand"}[sp["chargeModeName"]]
    ip = 2
    r = card.get("rewriteValue", {})
    try:
        ip = r.get("template_RENDER", {}).get("calculator_ip", {}).get("UNSET_Stepper_0", {}).get("measureValue", 2)
    except AttributeError:
        pass
    return {"region": sp["region"], "billing": billing, "quantity": 1, "periods": int(sp.get("periodNum") or 1),
            "hours": float(p.get("usageValue") or 730), "public_ip_count": ip}


def rebuild(card: dict[str, Any], calc=None) -> dict[str, Any]:
    return ElbBuilder(calc).build(**options(card))
