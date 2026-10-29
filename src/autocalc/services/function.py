"""FunctionGraph card builder: request + compute (GB-s) usage lines.

The catalog has one ``functionstage`` item per usage factor (diskcompute,
sparecompute, request, compute); the builder picks the item by factor.

Scaling (from the portal config bundle ``/config?urlPath=function``): the request line's
usage is expressed in **millions** of requests (``getRequest(...)/1000000``, measure 32),
so ``usageValue = requests / 1e6``. The compute line stores GB-seconds with measure 39.

KNOWN GAP: the intl API returns amount 0 for the ``compute`` line in every region tested
(ap-southeast-1, sa-brazil-1, la-south-2) - the catalog price for that factor is null - so
FunctionGraph compute cannot currently be priced (only the request line is billable).
"""

from __future__ import annotations

import json
import math
from typing import Any

from autocalc.client import Billing
from autocalc.errors import ValidationError
from autocalc.services.base import Builder, _stepper, register

GROUP = "functionstage_functionstage"
SPEC = "functionstage"


@register("function")
def _factory(calc=None) -> FunctionBuilder:
    return FunctionBuilder(calc)


class FunctionBuilder(Builder):
    service = "function"
    description = "FunctionGraph"
    modes = ("ondemand",)

    def _item(self, region: str, factor: str) -> dict[str, Any]:
        for it in self.calc.product_info("function", region)["product"].get(GROUP, []):
            if any(p.get("usageFactor") == factor for p in it.get("planList", [])):
                return json.loads(json.dumps(it))
        from autocalc.errors import SpecNotFound
        raise SpecNotFound(f"functionstage has no {factor!r} line in {region}")

    def build(self, region: str, requests: float = 1_000_000, gb_seconds: float = 400_000,
              billing: Billing = "ondemand", quantity: int = 1, hours: float = 730,
              memory_mb: float = 128, compute_units: float | None = None, request_units: float | None = None,
              title: str | None = None) -> dict[str, Any]:
        for field, value in {"requests": requests, "gb_seconds": gb_seconds, "memory_mb": memory_mb}.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValidationError("FunctionGraph usage must be finite nonnegative numbers.", field=field)
        if gb_seconds > 0 or (compute_units is not None and compute_units != 0):
            raise ValidationError("FunctionGraph compute has no reliable upstream price; positive compute cannot be quoted.", field="gb_seconds")
        req = self.product(self._item(region, "request"), billing, 1, hours)
        req.update(addToList_title="calc_2_", addToList_product=requests / 1_000_000,
                   usageFactor="request", usageValue=requests / 1_000_000, usageMeasureId=32)
        cmp = self.product(self._item(region, "compute"), billing, 1, hours)
        cmp.update(addToList_title="calc_5_", addToList_product=gb_seconds,
                   usageFactor="compute", usageValue=gb_seconds, usageMeasureId=39)
        # The page takes requests in ten-thousands and the average duration in ms.
        if request_units is None:
            request_units = requests / 10_000
        if compute_units is None:
            compute_units = round(gb_seconds / (requests * memory_mb / 1024) * 1000) if requests and memory_mb else 100
        return self.assemble(region, billing, 1, hours, quantity, [req, cmp], self.description,
                             {"calculator_fgs_compute": str(int(compute_units)),
                              "calculator_fgs_memory": {"UNSET_Stepper_0": _stepper(11, memory_mb)},
                              "calculator_fgs_request": {"UNSET_Stepper_0": _stepper(20, request_units)}},
                             title=title, include_time=False, include_quantity=False)
