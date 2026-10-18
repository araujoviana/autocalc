"""NAT Gateway card builder (B8): one on-demand gateway product."""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, register

GROUP = "natgateway_natgateway"


@register("nat")
def _factory(calc=None) -> NatBuilder:
    return NatBuilder(calc)


class NatBuilder(Builder):
    service = "nat"
    spec_arg = "size"

    def spec_option(self, spec: str) -> str:
        return spec.removeprefix("natgateway_")
    description = "NAT Gateway"
    modes = ("ondemand",)

    def build(self, region: str, size: str = "small", billing: Billing = "ondemand", quantity: int = 1,
              hours: float = 730, title: str | None = None) -> dict[str, Any]:
        p = self.product(self.catalog(region, GROUP, f"natgateway_{size}"), billing, 1, hours)
        p.update(addToList_title="calc_1_", addToList_product="dataInfo_1_", usageFactor="duration",
                 usageValue=hours, usageMeasureId=0, usageMeasureName="", usageMeasurePluralName="")
        return self.assemble(region, billing, 1, hours, quantity, [p], self.description,
                             {"calculator_nat_radio": {"type": "dataInfo_1_"},
                              "calculator_nat_type": {"nattype": "dataInfo_5_"}}, title=title,
                             include_quantity=False)
