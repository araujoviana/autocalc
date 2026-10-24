"""What a saved list contains, resource by resource: sizes, vCPUs, RAM, storage."""

from __future__ import annotations

import re
from typing import Any

PREFIX = "hws.resource.type."
# Counted as a machine with vCPUs and RAM; storage in GB (measure 17); backup capacity on its own.
MACHINES = {"vm", "rds.vm"}
STORAGE = {"volume", "rds.volume", "dms.storage", "sfsturbo"}
BACKUP = {"cbr.vault"}
GB = 17  # the calculator's measure id for GB


def _num(pattern: str, text: str) -> float:
    m = re.search(pattern, text)
    return float(m.group(1)) if m else 0.0


def _vcpus(p: dict[str, Any], desc: str) -> float:
    """From the description; reserved-instance cards have none and keep a number glued to a unit key in ``cpu``."""
    return _num(r"vCPUs?:\s*([\d.]+)", desc) or _num(r"^([\d.]+)", str(p.get("cpu") or ""))


def _ram_gb(p: dict[str, Any], desc: str) -> float:
    return _num(r"Memory:\s*([\d.]+)\s*MB", desc) / 1024 or _num(r"^([\d.]+)", str(p.get("mem") or ""))


def total(detail: dict[str, Any]) -> float:
    t = detail.get("totalPrice")
    return float((t.get("amount") if isinstance(t, dict) else t) or 0)


def resources(detail: dict[str, Any]) -> list[dict[str, Any]]:
    """One row per priced resource of every card. Quantities are already in ``productNum``."""
    rows = []
    for item in detail.get("cartListData") or []:
        card = item.get("selectedProduct") or {}
        for p in card.get("productAllInfos") or []:
            kind = (p.get("resourceType") or "").removeprefix(PREFIX)
            if not kind:  # the usage-hours line that carries no price of its own
                continue
            qty, desc = p.get("productNum") or 1, p.get("productSpecSysDesc") or ""
            gb = (p.get("resourceSize") or 0) * qty if p.get("resouceSizeMeasureId") == GB else 0
            machine = kind in MACHINES
            rows.append({"service": card.get("serviceCode"), "region": card.get("region"),
                         "billing": card.get("chargeModeName"), "resource": kind, "spec": p.get("resourceSpecCode"),
                         "quantity": qty, "storage_gb": gb if kind in STORAGE else 0, "backup_gb": gb if kind in BACKUP else 0,
                         "vcpus": _vcpus(p, desc) * qty if machine else 0,
                         "ram_gb": _ram_gb(p, desc) * qty if machine else 0,
                         "instances": qty if machine else 0,
                         "price": float((p.get("inquiryResult") or {}).get("amount") or 0)})
    return rows


def totals(rows: list[dict[str, Any]]) -> dict[str, float]:
    return {k: sum(r[k] for r in rows) for k in ("instances", "vcpus", "ram_gb", "storage_gb", "backup_gb")}
