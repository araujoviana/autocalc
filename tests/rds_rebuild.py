"""Rebuild an RDS card from its high-level options (golden test)."""

from __future__ import annotations

from typing import Any

from autocalc.services.rds import RdsBuilder

VM = "hws.resource.type.rds.vm"
VOL = "hws.resource.type.rds.volume"


def options(card: dict[str, Any]) -> dict[str, Any]:
    sp = card["selectedProduct"]
    vm = next(p for p in sp["productAllInfos"] if p.get("resourceType") == VM)
    vol = next(p for p in sp["productAllInfos"] if p.get("resourceType") == VOL)
    billing = {"MONTHLY": "monthly", "YEARLY": "yearly", "ONDEMAND": "ondemand"}[sp["chargeModeName"]]
    return {"region": sp["region"], "flavor": vm["resourceSpecCode"], "storage_spec": vol["resourceSpecCode"],
            "storage_gb": int(vol.get("resourceSize") or 0), "billing": billing,
            "quantity": int((sp.get("purchaseNum") or {}).get("measureValue", 1)),
            "periods": int(sp.get("periodNum") or 1), "hours": float(vm.get("usageValue") or 730),
            "db_version": vm.get("dbVersion")}


def rebuild(card: dict[str, Any], calc=None) -> dict[str, Any]:
    return RdsBuilder(calc).build(**options(card))
