"""Rebuild a SFS Turbo card from its high-level options (golden test)."""

from __future__ import annotations

from typing import Any

from autocalc.services.sfs import SfsTurboBuilder


def options(card: dict[str, Any]) -> dict[str, Any]:
    sp = card["selectedProduct"]
    p = sp["productAllInfos"][0]
    billing = {"MONTHLY": "monthly", "YEARLY": "yearly", "ONDEMAND": "ondemand"}[sp["chargeModeName"]]
    return {"region": sp["region"], "tier": p.get("type") or "20MBps",
            "size_gb": int(p.get("resourceSize") or 0), "billing": billing,
            "quantity": int((sp.get("purchaseNum") or {}).get("measureValue", 1)),
            "periods": int(sp.get("periodNum") or 1),
            "hours": float(p.get("usageValue") or 730)}


def rebuild(card: dict[str, Any], calc=None) -> dict[str, Any]:
    return SfsTurboBuilder(calc).build(**options(card))
