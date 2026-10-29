"""Log Tank Service (LTS) card builder: pay-per-use usage lines.

Products (in order): log flow, log index, cold storage, standard storage,
basic transfer, senior transfer. Storage usage is measured in GB-hours.
Publication uses daily GB and retention days; legacy usage-total builds are rejected.
"""

from __future__ import annotations

import inspect
import math
from typing import Any

from autocalc.client import Billing
from autocalc.errors import ValidationError
from autocalc.services.base import Builder, _stepper, register

GB = 17
TRAFFIC = 10
HOURS_PER_MONTH = 720  # storage usage is GB-hours for a 30-day month


@register("lts")
def _factory(calc=None) -> LtsBuilder:
    return LtsBuilder(calc)


class LtsBuilder(Builder):
    service = "lts"
    description = "Log Tank Service"
    modes = ("ondemand",)

    _PAGE_OPTIONS = ("flow_gb_per_day", "index_percent", "retention_days", "cold_enabled",
                     "hot_retention_days", "transfer_basic_gb_per_day", "transfer_senior_gb_per_day", "months")

    def input_signature(self):
        return inspect.signature(self.form)

    def options(self) -> list[str]:
        return list(self._PAGE_OPTIONS)

    def form(self, *, region: str, billing: Billing = "ondemand", quantity: int = 1,
             flow_gb_per_day: float = 1, index_percent: float = 100, retention_days: int = 30,
             cold_enabled: bool = False, hot_retention_days: int = 30,
             transfer_basic_gb_per_day: float = 0, transfer_senior_gb_per_day: float = 0,
             months: int = 1, **legacy: Any) -> dict[str, Any]:
        """Page-native daily inputs; the website derives rated traffic and GB-hours.

        Control ids and month measure 20 were captured anonymously on 2026-10-29.
        Legacy storage_mb/cold_mb cannot map to retention and are rejected.
        """
        if legacy:
            raise ValidationError("LTS requires daily flow and retention inputs; legacy usage totals are ambiguous.",
                                  field=sorted(legacy)[0], allowed=list(self._PAGE_OPTIONS))
        if billing != "ondemand" or quantity != 1 or isinstance(quantity, bool):
            raise ValidationError("LTS supports one ondemand usage card.", field="billing")
        if not isinstance(cold_enabled, bool):
            raise ValidationError("cold_enabled must be boolean.", field="cold_enabled")
        numeric = {"flow_gb_per_day": flow_gb_per_day, "index_percent": index_percent,
                   "transfer_basic_gb_per_day": transfer_basic_gb_per_day,
                   "transfer_senior_gb_per_day": transfer_senior_gb_per_day}
        for key, value in numeric.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValidationError("LTS inputs must be finite nonnegative numbers.", field=key)
        for key, value in {"retention_days": retention_days, "hot_retention_days": hot_retention_days, "months": months}.items():
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise ValidationError("LTS retention and duration must be positive integers.", field=key)
        if index_percent > 100:
            raise ValidationError("LTS index percentage cannot exceed 100.", field="index_percent")
        if cold_enabled and hot_retention_days > retention_days:
            raise ValidationError("Hot retention cannot exceed total retention.", field="hot_retention_days")
        render = {
            "calculator_ltsLogFlow_stepper": {"UNSET_Stepper_0": _stepper(10, flow_gb_per_day)},
            "calculator_lts_cold_switch": {"UNSET_Switch": "calc_3_" if cold_enabled else "calc_4_"},
            "calculator_ltsLogIndexRate_stepper": {"UNSET_Stepper_0": _stepper(17, index_percent)},
            "calculator_lts_transfer_basic_stepper": {"UNSET_Stepper_0": _stepper(10, transfer_basic_gb_per_day)},
            "calculator_lts_transfer_senior_stepper": {"UNSET_Stepper_0": _stepper(10, transfer_senior_gb_per_day)},
        }
        if cold_enabled:
            render["calculator_ltsStorage_stepper"] = {"UNSET_Stepper_0": _stepper(17, retention_days)}
            render["calculator_ltsHotStorage_stepper"] = {"UNSET_Stepper_0": _stepper(17, hot_retention_days)}
        else:
            render["calculator_ltsStorage_normal_stepper"] = {"UNSET_Stepper_0": _stepper(17, retention_days)}
        return {"global_REGIONINFO": {"region": region, "locationType": "commonAZ", "chargeMode": "ONDEMAND"},
                "global_ONDEMANDTIME": {"UNSET_Stepper_0": _stepper(20, months)}, "template_RENDER": render}

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
        raise ValidationError("Legacy LTS usage totals cannot be mapped safely to the page. Use form() with daily GB and retention days.",
                              field="options", allowed=list(self._PAGE_OPTIONS))
