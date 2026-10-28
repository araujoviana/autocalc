"""OBS card builder (B4): a pay-per-use usage card (many obs.001 lines) or a storage package.

Usage cards carry one product per usage line (storage `size`, egress, requests,
transitions, CDN/CRR), all with spec `obs.001` (except `download.cdn`, spec `obs`)
and distinguished by `usageFactor`. The catalog has one plan per usageFactor, so the
builder selects the plan by factor.
"""

from __future__ import annotations

import copy
from typing import Any

from autocalc.services.base import Builder, _stepper, register, unit_str

GROUP = "obs_obs"
GB = 10          # GB measure
REQ = 54         # requests (per 10k) measure
TB = 9           # storage expressed in TB
CLASS_TOKEN = {"standard": "dataInfo_2_", "warm": "dataInfo_3_", "cold": "dataInfo_1_"}
SIZE_FACTOR = {"standard": "size", "warm": "size_warm", "cold": "size_cold"}

# usage factor -> render stepper (component id, sub, measureId, label token)
STEPS = {
    "download.external": ("calculator_Outbound_stepper", "UNSET_Stepper_0", 10, ""),
    "download_warm.external": ("calculator_Outbound_stepper", "UNSET_Stepper_0", 10, ""),
    "download_cold.external": ("calculator_Outbound_stepper", "UNSET_Stepper_0", 10, ""),
    "download_crr": ("calculator_Replication_stepper", "UNSET_Stepper_0", 17, ""),
    "download.cdn": ("calculator_Traffic_stepper", "UNSET_Stepper_0", 10, ""),
    "get": ("calculator_Request_wan_stepper2", "UNSET_Stepper_0", 54, "calc_12_"),
    "put": ("calculator_Request_wan_stepper3", "UNSET_Stepper_0", 54, "calc_12_"),
    "get_warm": ("calculator_Request_stepper2", "UNSET_Stepper_0", 31, "calc_16_"),
    "put_warm": ("calculator_Request_stepper3", "UNSET_Stepper_0", 31, "calc_16_"),
    "delete_warm": ("calculator_Request_stepper5", "UNSET_Stepper_0", 14, "calc_12_"),
    "get_cold": ("calculator_Request_stepper2", "UNSET_Stepper_0", 31, "calc_16_"),
    "put_cold": ("calculator_Request_stepper3", "UNSET_Stepper_0", 31, "calc_16_"),
    "delete_cold": ("calculator_Request_stepper5", "UNSET_Stepper_0", 14, "calc_12_"),
    "delete": ("calculator_Request_stepper4", "UNSET_Stepper_0", 31, "calc_16_"),
    "retrieval_size_warm": ("calculator_Traffic_Read_radio", "UNSET_Stepper_0", 10, ""),
    "restore_size_ex": ("calculator_Traffic_Read_radio", "UNSET_Stepper_0", 10, ""),
}

# usageFactor -> (spec, title, usageMeasureId, prod-template kind)
COMPONENT: dict[str, tuple[str, str, int, str]] = {
    "download.external": ("obs.001", "calc_8_", GB, "unit"),
    "download_warm.external": ("obs.001", "calc_8_", GB, "unit"),
    "download_cold.external": ("obs.001", "calc_8_", GB, "unit"),
    "get": ("obs.001", "calc_13_", REQ, "plain12"),
    "put": ("obs.001", "calc_14_", REQ, "plain12"),
    "get_warm": ("obs.001", "calc_13_", 31, "plain16"),
    "put_warm": ("obs.001", "calc_14_", 31, "plain16"),
    "delete_warm": ("obs.001", "calc_15_", 31, "plain16"),
    "get_cold": ("obs.001", "calc_13_", 31, "plain16"),
    "put_cold": ("obs.001", "calc_14_", 31, "plain16"),
    "delete_cold": ("obs.001", "calc_15_", 31, "plain16"),
    "delete": ("obs.001", "calc_15_", 31, "plain16"),
    "download.cdn": ("obs", "calc_10_", GB, "unit"),
    "download_crr": ("obs.001", "calc_11_", 17, "unit"),
    "retrieval_size_warm": ("obs.001", "calc_18_", GB, "retrieval"),
    "restore_size_ex": ("obs.001", "calc_18_", GB, "retrieval"),
    "transition_warm": ("obs.001", "detail_145_", 14, "plain12"),
    "transition_cold": ("obs.001", "detail_145_", 14, "plain12"),
}


@register("obs")
def _factory(calc=None) -> ObsBuilder:
    return ObsBuilder(calc)


class ObsBuilder(Builder):
    service = "obs"
    description = "Object Storage Service"
    modes = ("ondemand", "monthly", "yearly")

    def _item(self, region: str, factor: str, storage_class: str, spec: str) -> dict[str, Any]:
        items = self.calc.product_info("obs", region)["product"].get(GROUP, [])
        for it in items:
            if it.get("resourceSpecCode") != spec:
                continue
            if any(p.get("usageFactor") == factor for p in it.get("planList", [])):
                if factor.startswith("size") and it.get("storageType") not in (None, CLASS_TOKEN.get(storage_class)):
                    continue
                return it
        from autocalc.errors import SpecNotFound
        raise SpecNotFound(f"OBS usage line {factor!r} not found in {region}")

    def build(self, region: str, components: list[dict[str, Any]] | None = None,
              storage_class: str = "standard", multi_az: bool = False,
              package: str | None = None, billing: str = "ondemand", periods: int = 1, hours: float = 730,
              quantity: int = 1, title: str | None = None) -> dict[str, Any]:
        products: list[dict[str, Any]] = []
        class_tok = CLASS_TOKEN.get(storage_class, "dataInfo_2_")
        az_tok = "dataInfo_5_" if multi_az else "dataInfo_4_"

        if package:  # storage package (monthly/yearly)
            cat = self.catalog(region, GROUP, f"obs.storage.{package}")
            tok = cat["obsStorageSize"]
            p = self.product(cat, billing, periods, hours)
            p.update(resourceSpecType="DEFAULT", obsStorageSize=tok, packageType=cat.get("packageType", "dataInfo_9_"),
                     productType=cat.get("productType", "calc_29_"), storageType=cat.get("storageType", "dataInfo_2_"),
                     addToList_title="calc_1_", addToList_product=tok, productNum=1, inquiryTag="normal",
                     selfProductNum=1, cpqPurchaseDuration=1, cpqPeriodType=3, cpqPeriodNum=1)
            products.append(p)
            package_types = [p["packageType"]]
            render = {"calculator_productType_switch": {"productType": p["productType"]},
                      "calculator_storagePack_radio": {"obsStorageSize": tok}}
            # The free-outbound traffic package only exists in some regions; include it only if sold.
            try:
                tcat = self.catalog(region, GROUP, "obs.down.traffic.50gb")
            except Exception:
                tcat = None
            if tcat:
                ttok = tcat["obsDownTrafficSize"]
                t = self.product(tcat, billing, periods, hours)
                t.update(resourceSpecType="DEFAULT", obsDownTrafficSize=ttok,
                         packageType=tcat.get("packageType", "dataInfo_11_"),
                         productType=tcat.get("productType", "calc_29_"),
                         storageType=tcat.get("storageType", "dataInfo_2_"), addToList_title="calc_3_",
                         addToList_product=ttok, productNum=1, inquiryTag="normal", selfProductNum=1,
                         cpqPurchaseDuration=1, cpqPeriodType=3, cpqPeriodNum=1)
                products.append(t)
                package_types.append(t["packageType"])
                render["calculator_Outbound_radio"] = {"obsDownTrafficSize": ttok}
            render["calculator_Pack_checkboxGroup"] = {"packageType": package_types}
            return self.assemble(region, billing, periods, hours, quantity, products, self.description, render,
                                 title=title)

        for c in components or []:
            factor = c["factor"]
            if multi_az and factor in ("size", "size_warm"):
                factor += "_3az"
            value = c.get("value", 0)
            spec, ttl, umid, kind = COMPONENT.get(factor, ("obs.001", "calc_8_", GB, "unit"))
            if factor.startswith("size"):
                spec, ttl, kind = "obs.001", "calc_7_", "size"
            item = self._item(region, factor, storage_class, spec)
            p = self.product(copy.deepcopy(item), "ondemand", periods, hours,
                             plan_match=lambda pl, f=factor: pl.get("usageFactor") == f)
            size_unit = c.get("unit", "TB")
            step_tok = "calc_30_" if storage_class == "cold" else "calc_29_"
            is_transition = factor.startswith("transition")
            if factor.startswith("size"):
                umid = TB if size_unit == "TB" else GB
                rated_value = value * 1024 if factor.endswith("_3az") and size_unit == "TB" else value
                rated_measure = 17 if factor.endswith("_3az") else umid
                p.update(productNum=720, usageValue=rated_value, usageMeasureId=rated_measure,
                         addToList_product=f"{class_tok} | {value:g}{size_unit} | {az_tok} | {step_tok} | calc_45_:1calc_46_")
            else:
                prod = f"{value / 10000:g}calc_12_" if is_transition else self._prod(kind, value, umid)
                p.update(usageValue=value, usageMeasureId=umid, productNum=1, addToList_product=prod)
                if not (kind == "retrieval" or is_transition):
                    p.update(resourceSize=1, resouceSizeMeasureId=umid, resourceMeasureName="", resourceMeasurePluralName="")
            p.update(addToList_title=ttl, inquiryTag="normal", selfProductNum=1)
            products.append(p)
        return self.assemble(region, "ondemand", periods, hours, quantity, products, self.description,
                             self._template(components or [], class_tok, az_tok), title=title,
                             include_time=False, include_quantity=False)

    @staticmethod
    def _template(components: list[dict[str, Any]], class_tok: str, az_tok: str) -> dict[str, Any]:
        """Rebuild the pay-per-use render template (the components the portal enumerates)."""
        tr: dict[str, Any] = {}
        for c in components:
            f, v = c["factor"], c.get("value", 0)
            if f.startswith("size"):
                tr.setdefault("calculator_multiAZ_radio", {})["UNSET_Stepper_0"] = _stepper(TB if c.get("unit", "TB") == "TB" else GB, v)
                continue
            step = STEPS.get(f)
            if not step:
                continue
            key, sub, mid, name = step
            tr.setdefault(key, {})[sub] = _stepper(mid, v, name, name)
            if key == "calculator_Traffic_Read_radio":
                tr[key]["restorationType"] = "dataInfo_6_"
        if "calculator_multiAZ_radio" in tr:
            tr["calculator_multiAZ_radio"]["UNSET_Stepper_2"] = _stepper(20, 1)
            tr["calculator_multiAZ_radio"]["multiAZType"] = az_tok
        tr["calculator_productType_switch"] = {"productType": "calc_29_"}
        tr["calculator_storageType_switch"] = {"storageType": class_tok}
        return tr

    @staticmethod
    def _prod(kind: str, value: float, umid: int) -> str:
        if kind == "unit":
            return unit_str(value, umid)
        if kind == "retrieval":
            return f"dataInfo_6_ | {unit_str(value, umid)}"
        if kind == "plain12":
            return f"{value:g}calc_12_"
        return f"{value:g}calc_16_"
