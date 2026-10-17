"""Rebuild an EVS card from its high-level options (for the golden test)."""

from __future__ import annotations

from typing import Any

from autocalc.services.evs import IOPS_MEASURE, TP_MEASURE, EvsBuilder

VOL = "hws.resource.type.volume"


def _total(product: dict[str, Any], measure: str) -> int:
    """The configured total shown in the label, e.g. '15000detail_36_'."""
    return int(str(product["addToList_product"]).replace(measure, ""))


def options(card: dict[str, Any]) -> dict[str, Any]:
    sp = card["selectedProduct"]
    products = sp["productAllInfos"]
    vol = next(p for p in products if p.get("resourceType") == VOL
               and not str(p.get("resourceSpecCode", "")).endswith((".iops", ".throughput")))
    spec = vol["resourceSpecCode"]
    type_ = spec.split(".")[0]
    billing = {"MONTHLY": "monthly", "YEARLY": "yearly", "ONDEMAND": "ondemand"}[sp["chargeModeName"]]
    hours = float(vol.get("usageValue") or 730) if billing == "ondemand" else 730.0

    iops = throughput = None
    for p in products:
        code = str(p.get("resourceSpecCode", ""))
        if code.endswith(".iops"):
            iops = _total(p, IOPS_MEASURE)
        elif code.endswith(".throughput"):
            throughput = _total(p, TP_MEASURE)

    return {
        "region": sp["region"],
        "type": type_,
        "size_gb": int(vol.get("resourceSize") or 0),
        "quantity": int((sp.get("purchaseNum") or {}).get("measureValue", 1)),
        "billing": billing,
        "periods": int(sp.get("periodNum") or 1),
        "hours": hours,
        "iops": iops,
        "throughput": throughput,
    }


def rebuild(card: dict[str, Any], calc=None) -> dict[str, Any]:
    return EvsBuilder(calc).build(**options(card))
