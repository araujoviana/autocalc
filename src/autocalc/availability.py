"""Per-region availability validation.

Answers three questions before any builder runs:
  * is the service sold in this region?
  * which billing modes does the region offer for it?
  * does a given spec exist in the region's catalog?

Errors are actionable: they name the closest alternative.
"""

from __future__ import annotations

from typing import Any

from autocalc.client import Calculator
from autocalc.errors import ModeNotOffered, ServiceNotSold, SpecNotFound
from autocalc.regions import RegionResolver

_MODE_ALIASES = {
    "ondemand": "ONDEMAND", "ppu": "ONDEMAND", "pay-per-use": "ONDEMAND",
    "monthly": "PERIOD", "yearly": "PERIOD", "period": "PERIOD",
    "ri": "RI", "reserved": "RI",
}


class Availability:
    def __init__(self, calc: Calculator):
        self.calc = calc

    def _service_node(self, service: str) -> dict[str, Any]:
        for cat in self.calc.menu()["menuInfos"]:
            for s in cat["subCategoryLists"]:
                if s.get("urlPath") == service:
                    return s
        raise ServiceNotSold(f"Unknown service {service!r}.", details={"service": service})

    def regions_for(self, service: str) -> list[str]:
        node = self._service_node(service)
        return list((node.get("regionOnline") or {}).get("regionList", []))

    def service_in_region(self, service: str, region: str) -> bool:
        return region in self.regions_for(service)

    def modes_in_region(self, service: str, region: str) -> list[str]:
        node = self._service_node(service)
        ro = node.get("regionOnline") or {}
        entry = ro.get(region)
        if isinstance(entry, dict):
            return list(entry.get("common") or [])
        return []

    def check_service(self, service: str, region: str) -> None:
        if not self.service_in_region(service, region):
            resolver = RegionResolver.from_menu(self.calc.menu())
            others = [r for r in self.regions_for(service)]
            hint = None
            if others:
                hint = f"{service} is sold in: {', '.join(sorted(others)[:8])}"
            raise ServiceNotSold(
                f"{service} is not sold in {region} ({resolver.display(region)}).",
                hint=hint, details={"service": service, "region": region, "available_regions": others},
            )

    def check_mode(self, service: str, region: str, billing: str) -> None:
        self.check_service(service, region)
        want = _MODE_ALIASES.get(billing, billing.upper())
        offered = self.modes_in_region(service, region)
        if offered and want not in offered:
            raise ModeNotOffered(
                f"{service} does not offer {billing} in {region}.",
                hint=f"Offered modes here: {', '.join(offered)}",
                details={"service": service, "region": region, "offered": offered},
            )

    def spec_exists(self, service: str, region: str, group: str, spec: str) -> bool:
        items = self.calc.product_info(service, region)["product"].get(group, [])
        return any(it.get("resourceSpecCode") == spec for it in items)

    def require_spec(self, service: str, region: str, group: str, spec: str) -> dict[str, Any]:
        items = self.calc.product_info(service, region)["product"].get(group, [])
        for it in items:
            if it.get("resourceSpecCode") == spec:
                return it
        nearest = _nearest(items, spec)
        hint = None
        if nearest:
            hint = "Closest specs: " + ", ".join(nearest)
        raise SpecNotFound(
            f"{spec!r} not sold in {region} for {service} ({group}).",
            hint=hint, details={"spec": spec, "region": region, "group": group, "nearest": nearest},
        )


def _nearest(items: list[dict[str, Any]], spec: str, n: int = 5) -> list[str]:
    base = spec.split(".")[0].split("-")[0]
    scored = []
    for it in items:
        s = it.get("resourceSpecCode") or ""
        score = (0 if s.startswith(base) else 1, 0 if base in s else 1, abs(len(s) - len(spec)))
        scored.append((score, s))
    scored.sort()
    return [s for _, s in scored[:n] if s]
