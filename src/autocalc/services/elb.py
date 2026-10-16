"""ELB card builder (B7): shared ELB (`elbv2.basic.default`) plus its PPU instance SKU."""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, _stepper, register

GROUP = "elb_elbv2"
BASIC = "elbv2.basic.default"
INSTANCE = "21_instance"      # on-demand "instance" SKU added alongside basic ELB
IP_MEASURE = 14


@register("elb")
def _factory(calc=None) -> ElbBuilder:
    return ElbBuilder(calc)


class ElbBuilder(Builder):
    service = "elb"
    description = "Elastic Load Balance"
    modes = ("ondemand", "monthly", "yearly")

    def build(self, region: str, billing: Billing = "ondemand", quantity: int = 1, periods: int = 1,
              hours: float = 730, public_ip_count: int = 2, title: str | None = None) -> dict[str, Any]:
        # One card = one ELB instance: the render template carries no quantity stepper, so a
        # card saved with productNum>1 would drop back to 1 when re-priced on Edit. Callers
        # that need N load balancers add N cards (mirrors how the portal builds them).
        base = self.product(self.catalog(region, GROUP, BASIC), billing, periods, hours)
        base.update(addToList_title="calc_44_", addToList_product="dataInfo_6_", productNum=1, inquiryTag="normal")
        products = [base]
        if billing == "ondemand":
            base.setdefault("usageFactor", "duration")
            inst = self.product(self.catalog(region, GROUP, INSTANCE), billing, periods, hours)
            inst.update(addToList_title="calc_44_", addToList_product="dataInfo_2_", productNum=1, inquiryTag="normal")
            inst.setdefault("usageFactor", "duration")
            products.append(inst)
        render: dict[str, Any] = {"calculator_elb_type": {"elbType": base.get("elbType")}}
        if billing == "ondemand":
            render["calculator_ip"] = {"UNSET_Stepper_0": _stepper(IP_MEASURE, public_ip_count)}
        return self.assemble(region, billing, periods, hours, 1, products, self.description, render,
                             title=title, include_quantity=False)
