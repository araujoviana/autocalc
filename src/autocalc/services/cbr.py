"""Cloud Backup and Recovery (CBR) card builder: one vault product."""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, _stepper, register

GROUP = "cbr_cbr.vault"
GB = 17


@register("cbr")
def _factory(calc=None) -> CbrBuilder:
    return CbrBuilder(calc)


class CbrBuilder(Builder):
    service = "cbr"
    description = "Cloud Backup and Recovery"
    modes = ("ondemand", "monthly", "yearly")

    def build(self, region: str, vault_spec: str = "vault.backup.server.normal", size_gb: float = 100,
              billing: Billing = "yearly", quantity: int = 1, periods: int = 1, hours: float = 730,
              title: str | None = None) -> dict[str, Any]:
        p = self.product(self.catalog(region, GROUP, vault_spec), billing, periods, hours)
        first = "calc_5_" if "database" in vault_spec else "calc_3_"
        p.update(resourceSize=size_gb, resouceSizeMeasureId=GB, resourceMeasureName="", resourceMeasurePluralName="",
                 addToList_title="calc_1_", addToList_product=f"{first} | {size_gb:g}BSSUNIT.pluralUnit.{GB}")
        if billing == "ondemand":
            p.setdefault("usageFactor", "duration")
        return self.assemble(region, billing, periods, hours, quantity, [p], self.description,
                             {"calculator_cbr_type": {"UNSET_Stepper_0": _stepper(GB, size_gb), "item": first}}, title=title)
