"""Application Performance Management (APM) card builder: one instance product."""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, _stepper, register

GROUP = "apm_apm2.instance"
MEASURE = 30


@register("apm")
def _factory(calc=None) -> ApmBuilder:
    return ApmBuilder(calc)


class ApmBuilder(Builder):
    service = "apm"
    description = "Application Performance Management"
    modes = ("ondemand",)

    def build(self, region: str, spec: str = "apm2.instance.normal", billing: Billing = "ondemand",
              quantity: int = 1, hours: float = 730, title: str | None = None) -> dict[str, Any]:
        p = self.product(self.catalog(region, GROUP, spec), billing, 1, hours)
        p.update(addToList_title="the pricing unit of APM 2.0 Ondemand", addToList_product="detail_51_\uff1a1",
                 usageFactor="apm2.instance", usageValue=1, usageMeasureId=MEASURE, durationNum=hours,
                 productNum=hours)
        return self.assemble(region, billing, 1, hours, quantity, [p], self.description,
                             {"calculator_apm2Number_stepper": {"UNSET_Stepper_0": _stepper(MEASURE, 1, "detail_59_", "detail_59_")}},
                             title=title, include_quantity=False)
