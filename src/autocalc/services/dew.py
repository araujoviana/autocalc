"""Data Encryption Workshop (DEW) card builder.

Two shapes:
- KMS:   storage key product (``kms.ud.customer``) + API product (``kms.api``).
- CSMS:  secret storage (``csms.secret.storage``) + secret API (``csms.secret.api``).
"""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, _stepper, register

KMS_GROUP = "kms_kms"
CSMS_STORAGE_GROUP = "kms_csms.storage"
CSMS_API_GROUP = "kms_csms.api"
COUNT_MEASURE = 41
REQ_MEASURE = 54


@register("dew")
def _factory(calc=None) -> DewBuilder:
    return DewBuilder(calc)


class DewBuilder(Builder):
    service = "dew"
    description = "Data Encryption Workshop"
    modes = ("ondemand",)

    def build(self, region: str, keys: int = 1, api_requests: int = 1, billing: Billing = "ondemand",
              quantity: int = 1, hours: float = 730, days: float = 30, title: str | None = None,
              storage_spec: str = "kms.ud.customer", api_spec: str = "kms.api") -> dict[str, Any]:
        csms = storage_spec.startswith("csms")
        duration = days if csms else hours
        s_group = CSMS_STORAGE_GROUP if csms else KMS_GROUP
        a_group = CSMS_API_GROUP if csms else KMS_GROUP
        storage_title, api_title = ("calc_03_", "detail_112_")
        storage_first = "calc_02_" if csms else "calc_01_"
        storage_detail = f"{keys}detail_117_" if csms else f"dataInfo_11_ | {keys}detail_115_"

        s = self.product(self.catalog(region, s_group, storage_spec), billing, 1, hours)
        s.update(addToList_title=storage_title,
                 addToList_product=f"{storage_first} | {storage_detail}",
                 usageFactor="duration", usageValue=duration * keys,
                 usageMeasureId=0 if csms else 4, resourceSize=keys, resouceSizeMeasureId=COUNT_MEASURE,
                 resourceMeasureName="", resourceMeasurePluralName="")
        if csms:
            s["durationNum"] = days

        a = self.product(self.catalog(region, a_group, api_spec), billing, 1, hours)
        a.update(addToList_title=api_title, addToList_product=f"{api_requests}BSSUNIT.unit.{REQ_MEASURE}",
                 usageFactor="requestcount" if csms else "reqNumber", usageValue=api_requests,
                 usageMeasureId=REQ_MEASURE, resourceSize=1, resouceSizeMeasureId=REQ_MEASURE,
                 durationNum=duration, resourceMeasureName="", resourceMeasurePluralName="")
        tab = ({"UNSET_Stepper_1": _stepper(COUNT_MEASURE, keys, "detail_116_", "detail_117_"),
                "productType": "calc_02_"} if csms else
               {"UNSET_Stepper_0": _stepper(COUNT_MEASURE, keys, "detail_114_", "detail_115_"),
                "certType": "dataInfo_11_", "productType": "calc_01_"})
        return self.assemble(region, billing, 1, hours, quantity, [s, a], self.description,
                             {"calculator_kms_api": {"UNSET_Stepper_0": _stepper(REQ_MEASURE, api_requests)},
                              "calculator_productType_tab": tab}, title=title)
