"""Builder framework.

A *service profile* turns high-level options into one calculator card
(``{"buyUrl", "rewriteValue", "selectedProduct"}``) that the website renders.
Everything shared between services lives here: the catalog->card transform, the
rating call, totals and the share payload.

Card shape (learned from real saved lists via anonymous ``share/detail``):
    product = catalog SKU (all keys except ``planList``)
              + the chosen plan's fields (amount, billingMode, siteCode, ...)
              + ``bakPlanList`` (plans of the chosen mode)
              + UI fields (productNum, inquiryTag, selectIndex, addToList_*).
"""

from __future__ import annotations

import json
import secrets
import time
from collections.abc import Callable
from typing import Any

from autocalc.client import BILLING, Billing, Calculator, CalculatorError
from autocalc.errors import SpecNotFound

SHARE_URL = "https://www.huaweicloud.com/intl/en-us/pricing/calculator.html?shareListId={id}&currentCurrency={currency}"
CONSOLE = "https://console-intl.huaweicloud.com/ecm/"
SITE = "general.online.portal"

# billing -> (chargeMode, chargeModeName, periodType, purchaseTime measureId)
CHARGE: dict[str, tuple[str, str, int, int]] = {
    "monthly": ("PERIOD", "MONTHLY", 2, 20),
    "yearly": ("PERIOD", "YEARLY", 3, 19),
    "ondemand": ("ONDEMAND", "ONDEMAND", 4, 4),
    "ri": ("RI", "RI", 3, 19),
}
# keys copied from the chosen plan into the flat product
PLAN_KEYS = ("productId", "billingMode", "siteCode", "periodNum", "billingEvent", "measureUnit", "measureUnitStep")
QUANTITY_MEASURE = {"measureId": 41, "measureNameBeforeTrans": "calc_29_", "measurePluralNameBeforeTrans": "calc_30_"}
HOUR_MEASURE_ID = 4
GB_MEASURE_ID = 17

# registry: service code -> builder factory (populated by autocalc.services)
REGISTRY: dict[str, Callable[..., Builder]] = {}


def register(service: str):
    def deco(factory: Callable[..., Builder]):
        REGISTRY[service] = factory
        return factory
    return deco


def unit_str(value: float, measure_id: int) -> str:
    return f"{value:g}BSSUNIT.{'pluralUnit' if value > 1 else 'unit'}.{measure_id}"


class Builder:
    """Base class: shared catalog access, transform, pricing and assembly."""

    service: str = ""
    description: str = ""

    def __init__(self, calc: Calculator | None = None):
        self.calc = calc or Calculator()

    def build(self, *args: Any, **opts: Any) -> dict[str, Any]:
        """Return one card {"buyUrl","rewriteValue","selectedProduct"}. Overridden per service."""
        raise NotImplementedError

    # ---- catalog --------------------------------------------------------

    def catalog(self, region: str, group: str, spec: str, service: str | None = None,
                spec_id: str | None = None) -> dict[str, Any]:
        service = service or self.service
        items = self.calc.product_info(service, region)["product"].get(group, [])
        for it in items:
            if it.get("resourceSpecCode") == spec and (spec_id is None or it.get("specId") == spec_id):
                return json.loads(json.dumps(it))
        raise SpecNotFound(f"{spec!r}{'/' + spec_id if spec_id else ''} not sold in {region} for {service} ({group})",
                           hint="Run search_skus to list valid specs.")

    def image_name(self, img: dict[str, Any]) -> str:
        name = img.get("name", "")
        if name.startswith("{"):
            try:
                return json.loads(name).get("en-us", name)
            except ValueError:
                pass
        return name

    # ---- shared transform (B0.2) ---------------------------------------

    def product(self, cat: dict[str, Any], billing: Billing, periods: int, hours: float = 730,
                plan_match=None) -> dict[str, Any]:
        """catalog SKU -> card product: bakPlanList + the chosen plan flattened.

        ``plan_match`` optionally selects among the plans of the wanted billing mode
        (used by OBS, where many on-demand plans share the mode and differ by usageFactor).
        """
        _, mode_name, _, _ = CHARGE[billing]
        plans = cat.pop("planList", [])
        wanted = {"ONDEMAND"} if billing == "ondemand" else {"MONTHLY", "YEARLY"}
        bak = []
        for p in plans:
            if p.get("billingMode") not in wanted or (plan_match and not plan_match(p)):
                continue
            b = {k: p.get(k) for k in PLAN_KEYS}
            if p["billingMode"] == "ONDEMAND":
                b.update(usageFactor=p.get("usageFactor"), usageMeasureId=p.get("usageMeasureId"))
            b["amount"] = p.get("amount")
            bak.append(b)
        chosen = next((b for b in bak if b["billingMode"] == mode_name and b.get("periodNum") in (None, 1)), None)
        if chosen is None:
            raise CalculatorError(f"{cat.get('resourceSpecCode')} has no {mode_name} price")
        cat["bakPlanList"] = bak
        cat.update({k: v for k, v in chosen.items()})
        if billing == "ondemand":
            cat.update(usageMeasureId=HOUR_MEASURE_ID, transRate="", transTarget="",
                       usageValue=hours, usageMeasureName="", usageMeasurePluralName="")
        return cat

    def ondemand_usage(self, p: dict[str, Any], hours: float, usage_factor: str | None = None,
                       usage_value: float | None = None, measure_id: int | None = None) -> None:
        """Set the on-demand usage fields the UI stores (Duration by default)."""
        factor = usage_factor or p.get("usageFactor") or "Duration"
        p["usageFactor"] = factor
        p["usageMeasureId"] = measure_id or p.get("usageMeasureId") or HOUR_MEASURE_ID
        p["usageValue"] = hours if usage_value is None else usage_value
        p["usageMeasureName"] = ""
        p["usageMeasurePluralName"] = ""
        p["transRate"] = ""
        p["transTarget"] = ""

    # ---- pricing (B0.2) -------------------------------------------------

    def price(self, products: list[dict[str, Any]], region: str, billing: Billing, periods: int,
              time_tag: int) -> None:
        charging_mode, period_type = BILLING[billing]
        infos, by_id = [], {}
        for p in products:
            pid = f"{time_tag}-{p['selectIndex']}-{p.get('productId')}"
            if p.get("inquiryTag") != "normal":
                p["inquiryResult"] = {"amount": 0, "originalAmount": 0, "discountAmount": 0,
                                      "productId": "noId", "id": f"{time_tag}-{p['selectIndex']}-noId"}
                continue
            q = {"id": pid, "cloudServiceType": p["cloudServiceType"], "resourceType": p["resourceType"],
                 "resourceSpecCode": p["resourceSpecCode"], "productNum": p["productNum"]}
            if p.get("resourceSize") is not None:
                q.update(resourceSize=p["resourceSize"], resouceSizeMeasureId=p.get("resouceSizeMeasureId", GB_MEASURE_ID))
            if billing == "ondemand":
                q.update(usageFactor=p.get("usageFactor"), usageMeasureId=p.get("usageMeasureId"),
                         usageValue=p.get("usageValue"))
            infos.append(q)
            by_id[pid] = p
        res = self.calc.inquiry({"regionId": region, "chargingMode": charging_mode, "periodType": period_type,
                                 "periodNum": 1 if billing == "ondemand" else periods, "subscriptionNum": 1,
                                 "siteCode": "HWC", "productInfos": infos})
        for r in res["productRatingResult"]:
            by_id[r["id"]]["inquiryResult"] = {
                "id": r["id"], "productId": r.get("productId"), "amount": r["amount"],
                "discountAmount": r.get("discountAmount") or 0,
                "originalAmount": r.get("originalAmount") or r["amount"],
                "perAmount": r.get("perAmount"), "perDiscountAmount": r.get("perDiscountAmount"),
                "perOriginalAmount": r.get("perOriginalAmount"), "perPeriodType": r.get("perPeriodType"),
                "measureId": r.get("measureId", 1), "extendParams": r.get("extendParams"),
            }

    # ---- assembly (B0.2) ------------------------------------------------

    def assemble(self, region: str, billing: Billing, periods: int, hours: float, quantity: int,
                 products: list[dict[str, Any]], description: str, rewrite: dict[str, Any],
                 title: str | None = None, buy_url: str | None = None,
                 include_time: bool = True, include_quantity: bool = True,
                 extra_selected: dict[str, Any] | None = None, price_fn=None) -> dict[str, Any]:
        charge_mode, mode_name, period_type, time_measure = CHARGE[billing]
        time_value = hours if billing == "ondemand" else periods
        time_tag = int(time.time() * 1000)
        for idx, p in enumerate(products):
            p.setdefault("productNum", quantity)
            p.setdefault("inquiryTag", "normal")
            p.setdefault("selfProductNum", 1)
            p["selectIndex"] = idx
        if price_fn is not None:
            price_fn(products)
        else:
            self.price(products, region, billing, periods, time_tag)

        selected: dict[str, Any] = {
            "region": region, "locationType": "commonAZ", "chargeMode": charge_mode, "tag": SITE,
            "serviceCode": self.service, "timeTag": time_tag, "chargeModeName": mode_name,
            "periodType": period_type, "periodNum": 1 if billing == "ondemand" else periods,
            "subscriptionNum": 1, "description": description or self.description,
            "productAllInfos": products,
        }
        if include_time:
            selected["purchaseTime"] = {"measureValue": time_value, "measureId": time_measure,
                                        "measureNameBeforeTrans": "", "measurePluralNameBeforeTrans": ""}
        if include_quantity:
            selected["purchaseNum"] = {"measureValue": quantity, **QUANTITY_MEASURE}
        if extra_selected:
            selected.update(extra_selected)
        _totals(selected)
        selected["_cartId"] = secrets.token_hex(16).upper()
        selected["_customTitle"] = title or f"custom.{self.service} 1"

        rewrite = {"global_TITLE": {"tag": SITE}, "global_DESCRIPTION": description or self.description,
                   "global_REGIONINFO": {"region": region, "locationType": "commonAZ", "chargeMode": charge_mode},
                   "template_RENDER": rewrite}
        if include_time:
            if billing == "ondemand":
                rewrite["global_ONDEMANDTIME"] = {"UNSET_Stepper_0": _stepper(HOUR_MEASURE_ID, hours)}
            else:
                rewrite["global_PERIODTIME"] = {"UNSET_PeriodTime": {"measureValue": periods, "measureId": time_measure}}
        if include_quantity:
            rewrite["global_QUANTITY"] = {"UNSET_Stepper_0": _stepper(41, quantity, "calc_29_", "calc_30_")}
        return {"buyUrl": buy_url or "", "rewriteValue": rewrite, "selectedProduct": selected}

    # ---- list-level -----------------------------------------------------

    @staticmethod
    def share_payload(name: str, items: list[dict[str, Any]], settlement: str = "total") -> dict[str, Any]:
        total = {"amount": 0.0, "discountAmount": 0.0, "originalAmount": 0.0, "perAmount": 0, "monthlyAmount": 0}
        for i, it in enumerate(items, 1):
            sp = it["selectedProduct"]
            if sp.get("_customTitle", "").startswith("custom."):
                sp["_customTitle"] = f"custom.{sp['serviceCode']} {i}"
            for k in ("amount", "discountAmount", "originalAmount"):
                total[k] = round(total[k] + (sp.get(k) or 0), 6)
        mode = "cart.shareList.billingModeMonth" if settlement == "monthly" else "cart.shareList.billingModeTotal"
        return {"billingMode": mode, "cartListData": items, "name": name, "totalPrice": total}


# ---- module-level helpers ---------------------------------------------------


def _stepper(measure_id: int, value: float, name: str = "", plural: str = "") -> dict[str, Any]:
    return {"measureId": measure_id, "measureValue": value, "measureNameBeforeTrans": name,
            "measurePluralNameBeforeTrans": plural, "transRate": "", "transTarget": ""}


def _totals(selected: dict[str, Any]) -> None:
    base = ("amount", "discountAmount", "originalAmount")
    extra = ("perAmount", "installAmount", "perDiscountAmount", "perOriginalAmount")
    for k in base + extra:
        vals = [(p.get("inquiryResult") or {}).get(k) for p in selected["productAllInfos"]]
        if k in extra and all(v is None for v in vals):
            continue  # period/on-demand cards do not carry these (only RI does)
        selected[k] = round(sum(v or 0 for v in vals), 6)
