"""Web Application Firewall (WAF) card builder: pay-per-use domain/rule/request products."""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, _stepper, register

DOMAIN = ("waf_waf.payperusedomain", "waf.payperuse.domain", "calc_10_")
RULE = ("waf_waf.payperuserule", "waf.payperuse.rule", "calc_11_")
REQUEST = ("waf_waf.payperuserequest", "waf.payperuse.request", "calc_12_")


@register("waf")
def _factory(calc=None) -> WafBuilder:
    return WafBuilder(calc)


class WafBuilder(Builder):
    service = "waf"
    description = "Web Application Firewall"
    modes = ("ondemand",)

    def _pp(self, region: str, item: tuple, billing: Billing, hours: float, count: float,
            size: int, measure: int, measure_id: int, product_num: float) -> dict[str, Any]:
        group, spec, title = item
        p = self.product(self.catalog(region, group, spec), billing, 1, hours)
        p.update(resourceSize=size, resouceSizeMeasureId=measure, resourceMeasureName="",
                 resourceMeasurePluralName="", addToList_title=title,
                 addToList_product=f"{count:g}BSSUNIT.{'pluralUnit' if count > 1 else 'unit'}.{measure}",
                 usageFactor="count", usageValue=count, usageMeasureId=measure_id, durationNum=hours,
                 productNum=product_num)
        return p

    def build(self, region: str, domains: float = 1, rules: float = 1, requests: float = 1000000,
              billing: Billing = "ondemand", quantity: int = 1, hours: float = 730,
              title: str | None = None) -> dict[str, Any]:
        d = self._pp(region, DOMAIN, billing, hours, domains, int(domains), 14, 14, hours)
        r = self._pp(region, RULE, billing, hours, rules, int(rules), 14, 14, hours)
        q = self._pp(region, REQUEST, billing, hours, requests, 1, 32, 14, 1)
        q["addToList_product"] = "1BSSUNIT.unit.32"
        return self.assemble(region, billing, 1, hours, quantity, [d, r, q], self.description,
                             {"calculator_waf_domainOndemandStepper": {"UNSET_Stepper_0": _stepper(14, domains)},
                              "calculator_waf_ruleOndemandStepper": {"UNSET_Stepper_0": _stepper(14, rules)},
                              "calculator_waf_requestOndemandStepper": {"UNSET_Stepper_0": _stepper(32, requests / 1_000_000)},
                              "calculator_waf_wafModeRadio": {"wafMode": "calc_15_"}}, title=title,
                             include_quantity=False)
