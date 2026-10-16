"""Rebuild a CCE card from its high-level options (golden test)."""

from __future__ import annotations

from typing import Any

from autocalc.services.cce import CceBuilder


def options(card: dict[str, Any]) -> dict[str, Any]:
    sp = card["selectedProduct"]
    p = sp["productAllInfos"][0]
    spec = p["resourceSpecCode"]                 # cce.s2.small
    _, series, scale = spec.split(".", 2)
    billing = {"MONTHLY": "monthly", "YEARLY": "yearly", "ONDEMAND": "ondemand"}[sp["chargeModeName"]]
    return {"region": sp["region"], "cluster_type": "standard", "ha": series == "s2", "scale": scale,
            "billing": billing, "quantity": 1, "periods": int(sp.get("periodNum") or 1),
            "hours": float(p.get("usageValue") or 730)}


def rebuild(card: dict[str, Any], calc=None) -> dict[str, Any]:
    return CceBuilder(calc).build(**options(card))
