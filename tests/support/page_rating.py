"""Re-price a card's own products the way the Python builder does, for comparison with the page.

Period and on-demand cards go through the rating engine (``Builder.price``); RI cards follow
the calculator's RI rule (``EcsBuilder._price_ri``: perPrice x quantity x install months).
"""

from __future__ import annotations

import copy
from decimal import Decimal
from typing import Any

from autocalc.client import Calculator
from autocalc.page.store import cents
from autocalc.services.ecs import EcsBuilder

_BILLING = {"MONTHLY": "monthly", "YEARLY": "yearly", "ONDEMAND": "ondemand", "RI": "ri"}


def rerate(card: dict[str, Any], calc: Calculator | None = None) -> Decimal:
    """The card's total, recomputed from its products, rounded to cents."""
    sp = card["selectedProduct"]
    products = copy.deepcopy(sp["productAllInfos"])
    builder = EcsBuilder(calc)
    billing = _BILLING[sp["chargeModeName"]]
    if billing == "ri":
        ri = card["rewriteValue"]["template_RENDER"]["calculator_ecs_RIRadio"]["RITime"]
        builder._price_ri(products, sp["region"], ri.split("nodeData.")[-1])
    else:
        builder.price(products, sp["region"], billing, sp.get("periodNum") or 1, sp["timeTag"])
    return cents(sum(Decimal(str(p["inquiryResult"]["amount"])) for p in products))
