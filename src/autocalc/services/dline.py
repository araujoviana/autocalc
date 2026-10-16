"""Cloud Connect / Direct Connect (DCAAS) card builder: one port product."""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, register

GROUP = "dcaas_dcaas.port"


@register("dline")
def _factory(calc=None) -> DlineBuilder:
    return DlineBuilder(calc)


class DlineBuilder(Builder):
    service = "dline"
    description = "Cloud Connect / Direct Connect As A Service"
    modes = ("ondemand", "monthly", "yearly")

    def build(self, region: str, port: str = "1ge", billing: Billing = "monthly", quantity: int = 1,
              periods: int = 1, hours: float = 730, title: str | None = None) -> dict[str, Any]:
        p = self.product(self.catalog(region, GROUP, port), billing, periods, hours)
        p.update(addToList_title="calc_1_", addToList_product="dataInfo_1_")
        return self.assemble(region, billing, periods, hours, quantity, [p], self.description,
                             {"calculator_dline_radio": {"portType": "dataInfo_1_"}}, title=title)
