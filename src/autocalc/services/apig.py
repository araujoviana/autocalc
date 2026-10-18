"""API Gateway card builder (B8): one instance product (edition)."""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, register

GROUP = "apig_apig.instance"


@register("apig")
def _factory(calc=None) -> ApigBuilder:
    return ApigBuilder(calc)


class ApigBuilder(Builder):
    service = "apig"
    spec_arg = "edition"
    description = "API Gateway"
    modes = ("ondemand",)

    def build(self, region: str, edition: str = "BASIC", billing: Billing = "ondemand", quantity: int = 1,
              periods: int = 1, hours: float = 730, title: str | None = None) -> dict[str, Any]:
        p = self.product(self.catalog(region, GROUP, edition), billing, periods, hours)
        p.update(addToList_title="calc_1_", addToList_product="dataInfo_1_")
        return self.assemble(region, billing, periods, hours, quantity, [p], self.description,
                             {"calculator_spec_radioGroups": {"type": "dataInfo_1_"},
                              "calculator_bandwidth_switch": {"UNSET_Switch": "dataInfo_6_"}}, title=title,
                             include_quantity=False)
