"""CCE card builder (B3): one cluster product, `cce.s{1,2}.{scale}`."""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, register

GROUP = "cce_cce.cluster"
SCALES = ("small", "medium", "large", "xlarge")


@register("cce")
def _factory(calc=None) -> CceBuilder:
    return CceBuilder(calc)


class CceBuilder(Builder):
    service = "cce"
    description = "Cloud Container Engine"
    modes = ("ondemand", "monthly", "yearly")

    def build(self, region: str, cluster_type: str = "standard", ha: bool = True, scale: str = "small",
              billing: Billing = "ondemand", quantity: int = 1, periods: int = 1, hours: float = 730,
              title: str | None = None) -> dict[str, Any]:
        # Turbo has distinct t-series catalog products and no verified form mapping yet.
        if cluster_type != "standard":
            from autocalc.errors import ValidationError
            raise ValidationError("Only standard CCE clusters have a verified form mapping.", field="cluster_type", allowed=["standard"])
        # HA standard uses s2; single-master standard uses s1.
        if scale not in SCALES:
            from autocalc.errors import ValidationError
            raise ValidationError(f"unknown CCE scale {scale!r}", field="scale", allowed=list(SCALES))
        series = "s2" if ha else "s1"
        spec = f"cce.{series}.{scale}"
        p = self.product(self.catalog(region, GROUP, spec), billing, periods, hours)
        if billing == "ondemand":
            p.setdefault("usageFactor", "duration")
        p.update(addToList_title="dataInfo_15_",
                 addToList_product=" | ".join(str(p.get(k)) for k in
                                              ("productType", "clusterType", "clusterNodeScale", "clusterMasterScale")))
        render = {"calculator_clustertype_radio": {"productType": p.get("productType"),
                                                   "clusterType": p.get("clusterType"),
                                                   "clusterNodeScale": p.get("clusterNodeScale"),
                                                   "clusterMasterScale": p.get("clusterMasterScale")}}
        return self.assemble(region, billing, periods, hours, quantity, [p], self.description, render, title=title)
