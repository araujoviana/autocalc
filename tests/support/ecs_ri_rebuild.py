"""Rebuild an ECS Reserved Instance (RI) card from its high-level options (golden test)."""

from __future__ import annotations

from typing import Any

from autocalc.services.ecs import EcsBuilder

VM = "hws.resource.type.vm"
VOL = "hws.resource.type.volume"


def options(card: dict[str, Any]) -> dict[str, Any]:
    sp = card["selectedProduct"]
    products = sp["productAllInfos"]
    vm = next(p for p in products if p.get("resourceType") == VM)
    img = next(p for p in products if p.get("inquiryTag") == "localImage")
    disks = [p for p in products if p.get("resourceType") == VOL]
    system_disk = ("GPSSD", 40)
    data_disks = []
    for d in disks:
        pair = (d.get("resourceSpecCode"), int(d.get("resourceSize") or 0))
        if d.get("_productType") == "main":
            system_disk = pair
        else:
            data_disks.append(pair)
    bw = next((p for p in products if p.get("resourceType") == "hws.resource.type.bandwidth"), None)
    return {"region": sp["region"], "flavor": vm["resourceSpecCode"], "ri_time": vm.get("RITime"),
            "quantity": int((sp.get("purchaseNum") or {}).get("measureValue", 1)),
            "image": img.get("name"), "system_disk": system_disk, "data_disks": data_disks,
            "bandwidth_mbit": int(bw["resourceSize"]) if bw and bw.get("resourceSize") is not None else None,
            "bandwidth_type": (bw or {}).get("resourceSpecCode") or "19_bgp"}


def rebuild(card: dict[str, Any], calc=None) -> dict[str, Any]:
    return EcsBuilder(calc).build_ri(**options(card))
