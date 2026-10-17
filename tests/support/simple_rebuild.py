"""Rebuild helpers for the simple single-product builders (golden test)."""

from __future__ import annotations

from typing import Any

_MODE = {"ONDEMAND": "ondemand", "MONTHLY": "monthly", "YEARLY": "yearly", "RI": "ri"}


def _first(card: dict[str, Any]):
    return card["selectedProduct"], card["selectedProduct"]["productAllInfos"][0]


def nat(card: dict[str, Any], calc=None):
    from autocalc.services.nat import NatBuilder
    sp, p = _first(card)
    return NatBuilder(calc).build(region=sp["region"], size=p["resourceSpecCode"].split("_", 1)[1],
                                  billing=_MODE[sp["chargeModeName"]], quantity=p.get("productNum", 1),
                                  hours=p.get("usageValue") or 730)


def apig(card: dict[str, Any], calc=None):
    from autocalc.services.apig import ApigBuilder
    sp, p = _first(card)
    return ApigBuilder(calc).build(region=sp["region"], edition=p["resourceSpecCode"],
                                   billing=_MODE[sp["chargeModeName"]], quantity=p.get("productNum", 1),
                                   periods=sp.get("periodNum", 1), hours=p.get("usageValue") or 730)


def dline(card: dict[str, Any], calc=None):
    from autocalc.services.dline import DlineBuilder
    sp, p = _first(card)
    return DlineBuilder(calc).build(region=sp["region"], port=p["resourceSpecCode"],
                                    billing=_MODE[sp["chargeModeName"]], quantity=p.get("productNum", 1),
                                    periods=sp.get("periodNum", 1))


def cbr(card: dict[str, Any], calc=None):
    from autocalc.services.cbr import CbrBuilder
    sp, p = _first(card)
    return CbrBuilder(calc).build(region=sp["region"], vault_spec=p["resourceSpecCode"],
                                  size_gb=p.get("resourceSize"), billing=_MODE[sp["chargeModeName"]],
                                  quantity=p.get("productNum", 1), periods=sp.get("periodNum", 1),
                                  hours=p.get("usageValue") or 730)


def apm(card: dict[str, Any], calc=None):
    from autocalc.services.apm import ApmBuilder
    sp, p = _first(card)
    return ApmBuilder(calc).build(region=sp["region"], spec=p["resourceSpecCode"],
                                  billing=_MODE[sp["chargeModeName"]], hours=p.get("durationNum") or 730)


def waf(card: dict[str, Any], calc=None):
    from autocalc.services.waf import WafBuilder
    sp = card["selectedProduct"]
    by = {p["resourceType"]: p for p in sp["productAllInfos"]}
    return WafBuilder(calc).build(region=sp["region"],
                                  domains=by["hws.resource.type.waf.payperusedomain"]["usageValue"],
                                  rules=by["hws.resource.type.waf.payperuserule"]["usageValue"],
                                  requests=by["hws.resource.type.waf.payperuserequest"]["usageValue"],
                                  billing=_MODE[sp["chargeModeName"]], hours=730)


def function(card: dict[str, Any], calc=None):
    from autocalc.services.function import FunctionBuilder
    sp = card["selectedProduct"]
    by = {p["usageFactor"]: p for p in sp["productAllInfos"]}
    tr = (card.get("rewriteValue") or {}).get("template_RENDER", {})
    return FunctionBuilder(calc).build(
        region=sp["region"], requests=by["request"]["usageValue"],
        gb_seconds=by["compute"]["usageValue"], billing=_MODE[sp["chargeModeName"]],
        memory_mb=tr.get("calculator_fgs_memory", {}).get("UNSET_Stepper_0", {}).get("measureValue", 128),
        compute_units=float(tr.get("calculator_fgs_compute") or 100),
        request_units=tr.get("calculator_fgs_request", {}).get("UNSET_Stepper_0", {}).get("measureValue", 100))


def dew(card: dict[str, Any], calc=None):
    from autocalc.services.dew import DewBuilder
    sp = card["selectedProduct"]
    prods = sp["productAllInfos"]
    s = prods[0]
    a = prods[1]
    csms = str(s["resourceSpecCode"]).startswith("csms")
    keys = int(s.get("resourceSize") or 1)
    kw = {"days": (s.get("usageValue") or 0) / max(keys, 1)} if csms else \
         {"hours": (s.get("usageValue") or 0) / max(keys, 1)}
    return DewBuilder(calc).build(region=sp["region"], keys=keys,
                                  api_requests=int(a.get("usageValue") or 1), billing=_MODE[sp["chargeModeName"]],
                                  storage_spec=s["resourceSpecCode"], api_spec=a["resourceSpecCode"], **kw)


def lts(card: dict[str, Any], calc=None):
    from autocalc.services.lts import LtsBuilder
    sp = card["selectedProduct"]
    prods = sp["productAllInfos"]

    def val(spec: str) -> float:
        p = next((x for x in prods if x.get("resourceSpecCode") == spec), None)
        return (p or {}).get("usageValue") or 0

    tr = (card.get("rewriteValue") or {}).get("template_RENDER", {})

    def knob(key: str) -> float:
        return tr.get(key, {}).get("UNSET_Stepper_0", {}).get("measureValue", 0)

    knobs = {"flow": knob("calculator_ltsLogFlow_stepper"), "index_rate": knob("calculator_ltsLogIndexRate_stepper"),
             "storage": knob("calculator_ltsStorage_stepper"), "hot": knob("calculator_ltsHotStorage_stepper"),
             "basic": knob("calculator_lts_transfer_basic_stepper"), "senior": knob("calculator_lts_transfer_senior_stepper")}
    return LtsBuilder(calc).build(region=sp["region"],
                                  flow_gb=val("lts.log.flow"), index_gb=val("lts.log.index"),
                                  cold_mb=val("lts.log.storage.cold"), storage_mb=val("lts.log.storage"),
                                  transfer_basic_gb=val("lts.log.transfer.basic"),
                                  transfer_senior_gb=val("lts.log.transfer.senior"), knobs=knobs)
