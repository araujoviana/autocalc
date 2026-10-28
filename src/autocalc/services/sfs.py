"""SFS Turbo card builder (B6): one product, size in GB shown in TB (measure 47)."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from autocalc.client import Billing
from autocalc.errors import ValidationError
from autocalc.services.base import Builder, register

GB = 17
TB = 47  # display measure for the size stepper
GROUP = "sfsturbo_sfsturbo"


@register("sfsturbo")
def _factory(calc=None) -> SfsTurboBuilder:
    return SfsTurboBuilder(calc)


class SfsTurboBuilder(Builder):
    service = "sfsturbo"
    spec_arg = "tier"
    description = "Scalable File Service Turbo"
    modes = ("ondemand", "monthly", "yearly")

    def build(self, region: str, tier: str = "20MBps", size_gb: float = 512, billing: Billing = "yearly",
              quantity: int = 1, periods: int = 1, hours: float = 730, title: str | None = None) -> dict[str, Any]:
        try:
            capacity = Decimal(str(size_gb))
            tb_decimal = capacity / 1024
            if not capacity.is_finite() or capacity <= 0 or tb_decimal != tb_decimal.quantize(Decimal("0.1")):
                raise ValueError
        except (InvalidOperation, ValueError):
            raise ValidationError("SFS Turbo capacity must be positive and representable in 0.1 TB increments.",
                                  field="size_gb") from None
        spec = tier if tier.startswith("sfs.turbo") else f"sfs.turbo.{tier}"
        p = self.product(self.catalog(region, GROUP, spec), billing, periods, hours)
        tb = float(tb_decimal)
        p.update(resourceSize=size_gb, resouceSizeMeasureId=GB, resourceMeasureName="", resourceMeasurePluralName="",
                 cpqPurchaseCapacity=size_gb, cpqPurchaseQuantity=quantity,
                 addToList_title="calc_18_",
                 addToList_product=f"{p.get('fileType')} | {p.get('sellingStatus')} | {p.get('sfsTypeList')} | "
                                   f"{tb:g}BSSUNIT.unit.{TB}")
        capacity_control = "calculator_sfsPeriod_36input" if spec == "sfs.turbo.20MBps" else "calculator_sfsPeriod_12input"
        render = {"calculator_sfsType_radio": {"fileType": p.get("fileType"), "sellingStatus": p.get("sellingStatus"),
                                               "sfsType": p.get("sfsType")},
                  capacity_control: tb}
        return self.assemble(region, billing, periods, hours, quantity, [p], self.description, render, title=title)
