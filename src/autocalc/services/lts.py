"""Log Tank Service (LTS) card builder: pay-per-use usage lines.

Products (in order): log flow, log index, cold storage, standard storage,
basic transfer, senior transfer. Storage values are stored in MB and shown in GB.
"""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, _stepper, register

GB = 17
TRAFFIC = 10
MB_PER_GB = 720  # display divisor used by the frontend for storage lines


@register("lts")
def _factory(calc=None) -> LtsBuilder:
    return LtsBuilder(calc)


class LtsBuilder(Builder):
    service = "lts"
    description = "Log Tank Service"
    modes = ("ondemand",)

    def _line(self, region: str, group: str, spec: str, factor: str, title: str, value: float,
              measure: int, prod_value: float, billing: Billing, hours: float) -> dict[str, Any]:
        p = self.product(self.catalog(region, group, spec), billing, 1, hours)
        p.update(addToList_title=title, addToList_product=f"{prod_value:.2f} GB", usageFactor=factor,
                 usageValue=value, usageMeasureId=measure, durationNum=1)
        return p

    def build(self, region: str, flow_gb: float = 0, index_gb: float = 0, cold_mb: float = 0,
              storage_mb: float = 0, transfer_basic_gb: float = 0, transfer_senior_gb: float = 0,
              billing: Billing = "ondemand", quantity: int = 1, hours: float = 730,
              knobs: dict[str, float] | None = None, title: str | None = None) -> dict[str, Any]:
        k: dict[str, float] = {"flow": 1, "index_rate": 100, "storage": 90, "hot": 30, "basic": 2, "senior": 2}
        k.update(knobs or {})
        products = [
            self._line(region, "lts_lts.logflow", "lts.log.flow", "traffic", "detail_7_",
                       flow_gb, TRAFFIC, flow_gb, billing, hours),
            self._line(region, "lts_lts.logindex", "lts.log.index", "traffic", "detail_6_",
                       index_gb, TRAFFIC, index_gb, billing, hours),
            self._line(region, "lts_lts.logstorage", "lts.log.storage.cold", "logcoldstoragesize", "detail_39_",
                       cold_mb, GB, cold_mb / MB_PER_GB, billing, hours),
            self._line(region, "lts_lts.logstorage", "lts.log.storage", "aom.size", "detail_5_",
                       storage_mb, GB, storage_mb / MB_PER_GB, billing, hours),
            self._line(region, "lts_lts.logtransfer", "lts.log.transfer.basic", "logbasictransfertraffic", "calc_23_",
                       transfer_basic_gb, TRAFFIC, transfer_basic_gb, billing, hours),
            self._line(region, "lts_lts.logtransfer", "lts.log.transfer.senior", "logseniortransfertraffic", "calc_24_",
                       transfer_senior_gb, TRAFFIC, transfer_senior_gb, billing, hours),
        ]
        return self.assemble(region, billing, 1, hours, quantity, products, self.description,
                             {"calculator_ltsLogFlow_stepper": {"UNSET_Stepper_0": _stepper(10, k["flow"], "detail_24_", "detail_24_")},
                              "calculator_ltsLogIndexRate_stepper": {"UNSET_Stepper_0": _stepper(17, k["index_rate"], "calc_20_", "calc_20_")},
                              "calculator_ltsStorage_stepper": {"UNSET_Stepper_0": _stepper(17, k["storage"], "detail_26_", "detail_26_")},
                              "calculator_ltsHotStorage_stepper": {"UNSET_Stepper_0": _stepper(17, k["hot"], "detail_26_", "detail_26_")},
                              "calculator_lts_cold_switch": {"UNSET_Switch": "calc_3_"},
                              "calculator_lts_transfer_basic_stepper": {"UNSET_Stepper_0": _stepper(10, k["basic"], "detail_24_", "detail_24_")},
                              "calculator_lts_transfer_senior_stepper": {"UNSET_Stepper_0": _stepper(10, k["senior"], "detail_24_", "detail_24_")}},
                             title=title, include_time=False, include_quantity=False)
