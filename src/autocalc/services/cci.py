"""CCI (Cloud Container Instance) card builder - the ECS-Fargate equivalent.

One container = one card (1 vCPU / N GiB, billed by the hour), matching what the
portal's CCI page produces for pay-per-use.  Reverse-engineered from a live card
captured in the browser (the render template is what makes Edit re-price correctly):

    rewriteValue.template_RENDER = {
        calculator_cciSpec_radio:    {arch, productType},
        calculator_vCPUs_stepper:    {UNSET_Stepper_0: {measureId 4,  measureValue vcpu}},
        calculator_mem_stepper:      {UNSET_Stepper_0: {measureId 10, measureValue mem}},
    }
    + global_ONDEMANDTIME (measureId 4)  - and NO global_QUANTITY / purchaseNum.
"""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, register

GROUP = "cci_container.instance"
CPU = "cci.container.cpu"
MEM = "cci.container.mem"

# config-derived tokens (from /config?urlPath=cci) - do not guess these
SPECS = {
    CPU: dict(name="calc_45_", table_unit="detail_32_", title="detail_101_", nid=4, nname="detail_106_",
              sysdesc="type:cpu", sku="type: cpu", typ="cpu"),
    MEM: dict(name="calc_43_", table_unit="detail_33_", title="detail_102_", nid=10, nname="detail_103_",
              sysdesc="type:mem", sku="type: mem", typ="mem"),
}
TIME_NAME = "detail_107_"


@register("cci")
def _factory(calc=None) -> CciBuilder:
    return CciBuilder(calc)


class CciBuilder(Builder):
    service = "cci"
    description = "Cloud Container Instance"
    modes = ("ondemand",)

    def _line(self, region: str, spec: str, num: int, hours: float) -> dict[str, Any]:
        m = SPECS[spec]
        p = self.product(self.catalog(region, GROUP, spec), "ondemand", 1, hours)
        p.update(resourceSpecType="DEFAULT", periodList=0, _skuInfo=[m["sku"]], type=m["typ"],
                 productSpecSysDesc=m["sysdesc"], billingCycle="detail_31_", arch="calc_27_",
                 productType="detail_1_", name=m["name"], tableUnit=m["table_unit"],
                 addToList_title=m["title"], addToList_product=f"calc_27_|detail_1_|{num}{m['nname']}",
                 productNum=num, productNumMeasureId=m["nid"], productNumMeasureName=m["nname"],
                 productNumMeasurePluralName=m["nname"], inquiryTag="normal",
                 usageFactor="duration", usageMeasureId=4, usageValue=hours,
                 usageMeasureName=TIME_NAME, usageMeasurePluralName=TIME_NAME,
                 transRate="", transTarget="", cpqPurchaseDuration=31536000)
        return p

    def build(self, region: str, vcpu: int = 1, mem_gb: int = 2, hours: float = 730,
              billing: Billing = "ondemand", quantity: int = 1, title: str | None = None) -> dict[str, Any]:
        if quantity != 1:
            from autocalc.errors import ValidationError
            raise ValidationError("CCI form supports one usage card.", field="quantity", allowed=[1])
        cpu = self._line(region, CPU, vcpu, hours)
        mem = self._line(region, MEM, mem_gb, hours)
        template = {
            "calculator_cciSpec_radio": {"arch": "calc_27_", "productType": "detail_1_"},
            "calculator_vCPUs_stepper": {"UNSET_Stepper_0": {"measureId": 4, "measureValue": vcpu,
                                                            "measureNameBeforeTrans": "detail_106_",
                                                            "measurePluralNameBeforeTrans": "detail_106_",
                                                            "transRate": "", "transTarget": ""}},
            "calculator_mem_stepper": {"UNSET_Stepper_0": {"measureId": 10, "measureValue": mem_gb,
                                                          "measureNameBeforeTrans": "detail_103_",
                                                          "measurePluralNameBeforeTrans": "detail_103_",
                                                          "transRate": "", "transTarget": ""}},
        }
        card = self.assemble(region, "ondemand", 1, hours, 1, [cpu, mem], self.description, template,
                             title=title, include_time=False, include_quantity=False)
        stepper = {"measureId": 4, "measureValue": hours, "measureNameBeforeTrans": TIME_NAME,
                   "measurePluralNameBeforeTrans": TIME_NAME, "transRate": "", "transTarget": ""}
        card["rewriteValue"]["global_ONDEMANDTIME"] = {"UNSET_Stepper_0": stepper}
        if "selectedProduct" in card:
            card["selectedProduct"]["purchaseTime"] = {"measureValue": hours, "measureId": 4,
                                                   "measureNameBeforeTrans": TIME_NAME,
                                                   "measurePluralNameBeforeTrans": TIME_NAME}
        return card
