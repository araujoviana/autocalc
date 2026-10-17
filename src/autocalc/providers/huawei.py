"""HuaweiProvider: the core's view of today's catalog, availability and list prices."""

from __future__ import annotations

import re
from decimal import Decimal

from autocalc.availability import Availability
from autocalc.client import Calculator, _parse_compute
from autocalc.core.model import Candidate, Requirement
from autocalc.errors import ValidationError

BILLING = ("ondemand", "monthly", "yearly")


class HuaweiProvider:
    name = "huawei"

    def __init__(self, calc: Calculator | None = None, availability: Availability | None = None):
        self.calc = calc or Calculator()
        self.availability = availability or Availability(self.calc)

    def candidates(self, req: Requirement) -> list[Candidate]:
        if req.billing not in BILLING:
            raise ValidationError(f"Billing {req.billing!r} is not supported here.", field="billing",
                                  allowed=list(BILLING))
        self.availability.check_mode(req.service, req.region, req.billing)
        out = []
        for sku in self.calc.skus(req.service, req.region):
            plan = sku.prices.get(req.billing)
            if plan is None or (req.group and sku.group != req.group):
                continue
            vcpus, mem = _parse_compute(sku.description)
            has = {k: v for k, v in (("vcpus", vcpus), ("memory_gb", mem)) if v is not None}
            gen = re.match(r"[A-Za-z]+(\d+)", sku.spec)
            out.append(Candidate(sku.spec, req.region, req.billing, Decimal(str(plan["amount"])), has,
                                 int(gen.group(1)) if gen else 0, sku.description))
        return out
