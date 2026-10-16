"""Rebuild an ECS card from its high-level options (for the golden test)."""

from __future__ import annotations

from typing import Any

from autocalc.services.ecs import EcsBuilder

VM = "hws.resource.type.vm"
VOL = "hws.resource.type.volume"
BW = ("hws.resource.type.bandwidth", "hws.resource.type.eip")


def options(card: dict[str, Any]) -> dict[str, Any]:
    sp = card["selectedProduct"]
    products = sp["productAllInfos"]
    vm = next(p for p in products if p.get("resourceType") == VM)
    flavor = vm["resourceSpecCode"]
    if flavor.endswith(".linux"):
        flavor = flavor[:-6]
    elif flavor.endswith(".win"):
        flavor = flavor[:-4]
    billing = sp["chargeModeName"]
    billing = {"MONTHLY": "monthly", "YEARLY": "yearly", "ONDEMAND": "ondemand"}[billing]
    qty = (sp.get("purchaseNum") or {}).get("measureValue", 1)
    periods = sp.get("periodNum") or 1
    hours = (vm.get("usageValue") if billing == "ondemand" else 730) or 730

    img = next((p for p in products if p.get("inquiryTag") == "localImage" or "image" in str(p.get("resourceType", ""))), None)
    image = img.get("name") if img else "AlmaLinux"

    disks = [p for p in products if p.get("resourceType") == VOL]
    system_disk = ("GPSSD", 40)
    data_disks = []
    for d in disks:
        pair = (d.get("resourceSpecCode") or d.get("type"), int(d.get("resourceSize") or 0))
        if d.get("_productType") == "main":
            system_disk = pair
        else:
            data_disks.append(pair)
    bw = next((p for p in products if p.get("resourceType") in BW), None)
    bandwidth_mbit = int(bw["resourceSize"]) if bw and bw.get("resourceSize") is not None else None
    bw_type = (bw or {}).get("resourceSpecCode") or "19_bgp"
    return {"region": sp["region"], "flavor": flavor, "billing": billing, "quantity": int(qty),
            "periods": int(periods), "hours": float(hours), "image": image, "system_disk": system_disk,
            "data_disks": data_disks, "bandwidth_mbit": bandwidth_mbit, "bandwidth_type": bw_type}


def rebuild(card: dict[str, Any], calc=None) -> dict[str, Any]:
    opts = options(card)
    # keep the original flavor suffix (linux/win/byol)
    vm = next(p for p in card["selectedProduct"]["productAllInfos"] if p.get("resourceType") == VM)
    opts["flavor"] = vm["resourceSpecCode"]
    return EcsBuilder(calc).build(**opts)
