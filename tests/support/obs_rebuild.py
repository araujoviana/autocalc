"""Rebuild an OBS card from its high-level options (golden test)."""

from __future__ import annotations

from typing import Any

from autocalc.services.obs import ObsBuilder

CLASS = {"dataInfo_2_": "standard", "dataInfo_3_": "warm", "dataInfo_1_": "cold"}


def options(card: dict[str, Any]) -> dict[str, Any]:
    sp = card["selectedProduct"]
    prods = sp["productAllInfos"]
    first = prods[0].get("resourceSpecCode", "")
    if first.startswith("obs.storage."):
        billing = {"MONTHLY": "monthly", "YEARLY": "yearly"}[sp["chargeModeName"]]
        return {"region": sp["region"], "package": first.split(".", 2)[2], "billing": billing,
                "periods": int(sp.get("periodNum") or 1), "quantity": 1}
    comps = []
    storage_class = "standard"
    multi_az = False
    for p in prods:
        f = p["usageFactor"]
        if f.startswith("size"):
            storage_class = CLASS.get(p.get("storageType"), "standard")
        if p.get("multiAZType") == "dataInfo_5_":
            multi_az = True
        prod = p.get("addToList_product") or ""
        parts = prod.split("|")
        unit = "TB" if len(parts) > 1 and "TB" in parts[1] else "GB"
        value = p.get("usageValue", 0)
        if f.startswith("size") and p.get("usageMeasureId") == 17 and unit == "TB":
            value /= 1024
        comps.append({"factor": f, "value": value, "unit": unit})
    return {"region": sp["region"], "components": comps, "storage_class": storage_class,
            "multi_az": multi_az, "billing": "ondemand"}


def rebuild(card: dict[str, Any], calc=None) -> dict[str, Any]:
    return ObsBuilder(calc).build(**options(card))
