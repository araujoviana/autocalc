"""ECS card builder (B1): VM + image + system and data disks + EIP bandwidth.

Hand-written first, now on the shared framework. Also exposes RI cards (B1).
"""

from __future__ import annotations

import json
from typing import Any

from autocalc.client import Billing, CalculatorError
from autocalc.services.base import CHARGE, CONSOLE, Builder, _stepper, register, unit_str

GB = 17
# bandwidth type -> (eipType token, measure id, stepper key). 19_bgp = fixed Mbit/s (measure 15);
# 12_bgp = pay-per-use traffic (measure 10, quantity 1). Getting this wrong re-prices on Edit.
EIP_TOKENS = {"19_bgp": ("dataInfo_18_", 15, "UNSET_Stepper_1"),
              "12_bgp": ("dataInfo_19_", 10, "UNSET_Stepper_2")}


@register("ecs")
def _factory(calc=None) -> EcsBuilder:
    return EcsBuilder(calc)


class EcsBuilder(Builder):
    service = "ecs"
    spec_arg = "flavor"
    description = "Elastic Cloud Server"
    modes = ("monthly", "yearly", "ondemand", "ri")

    # ---- image helpers --------------------------------------------------

    def images(self, region: str, flavor: str | None = None, query: str = "") -> list[dict[str, Any]]:
        family = flavor.split(".")[0] if flavor else None
        out = []
        for img in self.calc.product_info("ecs", region)["product"].get("ec2_vm.image.special", []):
            name = self.image_name(img)
            if family and family not in img.get("type", []):
                continue
            if all(t.lower() in f"{img.get('__platform')} {name}".lower() for t in query.split()):
                out.append({"id": img["id"], "platform": img.get("__platform"), "name": name, "os": img.get("__os_type")})
        return out

    def build(self, region: str, flavor: str, billing: Billing = "monthly", quantity: int = 1, periods: int = 1,
              hours: float = 730, image: str = "AlmaLinux", system_disk: tuple = ("GPSSD", 40),
              data_disks: list | None = None, bandwidth_mbit: int | None = None, bandwidth_type: str = "19_bgp",
              ri_time: str = "1_3", title: str | None = None) -> dict[str, Any]:
        if billing == "ri":
            return self.build_ri(region, flavor, ri_time=ri_time, quantity=quantity, image=image,
                                 system_disk=system_disk, data_disks=data_disks,
                                 bandwidth_mbit=bandwidth_mbit, bandwidth_type=bandwidth_type, title=title)
        charge_mode, mode_name, period_type, time_measure = CHARGE[billing]
        spec = flavor if flavor.endswith((".linux", ".win")) else f"{flavor}.linux"
        vm = self.product(self.catalog(region, "ec2_vm", spec), billing, periods, hours)
        vm["addToList_title"] = "calc_2_"
        vm["addToList_product"] = " | ".join([vm["arch"], vm["vmType"], vm["spec"], vm["cpu"], vm["mem"]])

        imgs = self.images(region, vm["spec"], image) or self.images(region, None, image)
        if not imgs:
            raise CalculatorError(f"no image matching {image!r} in {region}")
        img_raw = next(i for i in self.calc.product_info("ecs", region)["product"]["ec2_vm.image.special"]
                       if i["id"] == imgs[0]["id"])
        img = json.loads(json.dumps(img_raw))
        img["name"] = self.image_name(img)
        img.update(addToList_title="calc_4_", addToList_product=f"{img['__platform']} | {img['name']}")

        products: list[dict[str, Any]] = [vm, img]
        disks = []
        for i, (dtype, size) in enumerate([system_disk, *(data_disks or [])]):
            d = self.product(self.catalog(region, "ebs_volume", dtype), billing, periods, hours)
            d.update(resourceSize=size, resouceSizeMeasureId=GB, resourceMeasureName="", resourceMeasurePluralName="",
                     addToList_title="calc_11_" if i == 0 else "calc_12_",
                     addToList_product=f"{d['type']} | {unit_str(size, GB)}", _productType="main" if i == 0 else "addible")
            products.append(d)
            disks.append((dtype, size, d["type"]))
        has_bw = bandwidth_mbit is not None or bandwidth_type == "12_bgp"
        eip_tok, eip_mid, eip_sub = EIP_TOKENS.get(bandwidth_type, EIP_TOKENS["19_bgp"])
        eip_size = 1 if bandwidth_type == "12_bgp" else (bandwidth_mbit or 0)
        if has_bw:
            bw = self.product(self.catalog(region, "vpc_bandwidth", bandwidth_type), billing, periods, hours)
            bw.update(eipSpec="dataInfo_14_", shareType="dataInfo_16_", eipType=eip_tok, name="dataInfo_14_",
                      resourceSize=bandwidth_mbit, resouceSizeMeasureId=eip_mid, resourceMeasureName="",
                      resourceMeasurePluralName="", addToList_title="calc_5_",
                      addToList_product=f"dataInfo_14_ | dataInfo_16_ | {eip_tok} | {unit_str(eip_size, eip_mid)}")
            products.append(bw)

        for p in products:
            p["productNum"] = quantity
            p["inquiryTag"] = "localImage" if p is img else "normal"
            p["selfProductNum"] = 1
            if p is img and billing == "ondemand":
                p.update(productNum=int(quantity * hours), transRate="", transTarget="", durationNum=hours)

        render: dict[str, Any] = {
            "calculator_ecs_radio": {"arch": vm["arch"], "vmType": vm["vmType"], "generation": vm["generation"],
                                     "cpu": vm["cpu"], "mem": vm["mem"]},
            "calculator_eip_switch": {"UNSET_Switch": "calc_14_" if has_bw else "calc_15_"},
        }
        if has_bw:
            render["calculator_eip_radio"] = {"eipSpec": "dataInfo_14_", "shareType": "dataInfo_16_",
                                              "eipType": eip_tok, eip_sub: _stepper(eip_mid, eip_size)}
        render["calculator_ims_select"] = {"__platform": img["__platform"], "name": img["name"]}
        evs = {"calculator_evs_stepper_main": {"type": disks[0][2], "UNSET_Stepper_0": _stepper(GB, disks[0][1])}}
        for k, (_dt, ds, dty) in enumerate(disks[1:]):
            evs[f"calculator_evs_stepper_|addible0|_{k}"] = {"type": dty, "UNSET_Stepper_0": _stepper(GB, ds)}
        render["calculator_evs_stepper"] = evs

        data_disk = ",".join(f"{t}:{s}" for t, s, _ in disks[1:])
        period = "" if billing == "ondemand" else f"{periods}{'m' if billing == 'monthly' else 'y'}"
        buy = (f"{CONSOLE}?region={region}&locale=en-us&charging={0 if billing == 'ondemand' else 1}"
               f"&flavor={vm['spec']}&imageId={img['id']}&sysdisk={disks[0][0]}:{disks[0][1]}&datadisk={data_disk}"
               f"&iptype=5_bgp&ipcharging=bandwidth&bwsize={bandwidth_mbit or 0}&vmcount={quantity}&period={period}#/ecs/createVm")
        return self.assemble(region, billing, periods, hours, quantity, products, self.description,
                             render, title=title, buy_url=buy)

    # ---- Reserved Instances (B1) ----------------------------------------

    def _ri_item(self, region: str, spec: str, ri_time: str) -> dict[str, Any]:
        items = self.calc.product_info("ecs", region)["product"].get("ec2_vm", [])
        for it in items:
            if it.get("resourceSpecCode") == spec and it.get("RITime") == ri_time \
                    and any(p.get("billingMode") == "RI" for p in it.get("planList", [])):
                return it
        raise CalculatorError(f"no RI plan for {spec} {ri_time} in {region}")

    def build_ri(self, region: str, flavor: str, ri_time: str = "1_3", payment_type: str = "NO_UPFRONT",
                 quantity: int = 1, image: str = "AlmaLinux", system_disk: tuple = ("GPSSD", 40),
                 data_disks: list | None = None, bandwidth_mbit: int | None = None,
                 bandwidth_type: str = "19_bgp", title: str | None = None) -> dict[str, Any]:
        """One RI ECS card: image + VM (RI plan) + on-demand disks ('combine')."""
        spec = flavor if flavor.endswith((".linux", ".win")) else f"{flavor}.linux"
        ri_key = ri_time.split("nodeData.")[-1]
        ri_full = ri_time if ri_time.startswith("nodeData.") else f"nodeData.{ri_time}"
        item = json.loads(json.dumps(self._ri_item(region, spec, ri_full)))
        plans = item.pop("planList", [])
        ri_plans = [p for p in plans if p.get("billingMode") == "RI"]
        by_origin = {p.get("originType"): p for p in ri_plans}
        vm = item
        vm["bakPlanList"] = ri_plans
        pr, pp, pe = by_origin.get("price", {}), by_origin.get("perPrice", {}), by_origin.get("perEffectivePrice", {})
        vm.update(billingMode="RI", productId=pr.get("productId"), skuCode=pr.get("skuCode"), planId=pr.get("planId"),
                  paymentType=pr.get("paymentType") or f"nodeData.{payment_type}", RITime=pr.get("RITime") or item.get("RITime"),
                  price=pr.get("amount"), perPrice=pp.get("amount"), perEffectivePrice=pe.get("amount"))
        vm.update(addToList_title="calc_2_",
                  addToList_product=" | ".join(str(vm.get(k)) for k in
                                               ("arch", "vmType", "spec", "cpu", "mem", "paymentType", "RITime")))

        imgs = self.images(region, vm.get("spec"), image) or self.images(region, None, image)
        if not imgs:
            raise CalculatorError(f"no image matching {image!r} in {region}")
        img_raw = next(i for i in self.calc.product_info("ecs", region)["product"]["ec2_vm.image.special"]
                       if i["id"] == imgs[0]["id"])
        img = json.loads(json.dumps(img_raw))
        img["name"] = self.image_name(img)
        img.update(addToList_title="calc_4_", addToList_product=f"{img['__platform']} | {img['name']}",
                   inquiryTag="localImage", productNum=quantity, selfProductNum=1)

        products: list[dict[str, Any]] = [img, vm]
        for i, (dtype, size) in enumerate([system_disk, *(data_disks or [])]):
            d = self.product(self.catalog(region, "ebs_volume", dtype), "ondemand", 1, 730)
            d.update(resourceSize=size, resouceSizeMeasureId=GB, resourceMeasureName="", resourceMeasurePluralName="",
                     measureUnit=4, measureUnitStep=1, _injectedMode="ONDEMAND", cpqPurchaseDuration=8760,
                     addToList_title="calc_11_" if i == 0 else "calc_12_",
                     addToList_product=f"{d.get('type')} | {unit_str(size, GB)}",
                     inquiryTag="combine", _productType="main" if i == 0 else "addible")
            products.append(d)
        has_bw = bandwidth_mbit is not None or bandwidth_type == "12_bgp"
        eip_tok, eip_mid, eip_sub = EIP_TOKENS.get(bandwidth_type, EIP_TOKENS["19_bgp"])
        eip_size = 1 if bandwidth_type == "12_bgp" else (bandwidth_mbit or 0)
        if has_bw:
            bw = self.product(self.catalog(region, "vpc_bandwidth", bandwidth_type), "ondemand", 1, 730)
            bw.update(eipSpec="dataInfo_14_", shareType="dataInfo_16_", eipType=eip_tok, name="dataInfo_14_",
                      resourceSize=bandwidth_mbit, resouceSizeMeasureId=eip_mid, resourceMeasureName="",
                      resourceMeasurePluralName="", addToList_title="calc_5_", inquiryTag="combine",
                      addToList_product=f"dataInfo_14_ | dataInfo_16_ | {eip_tok} | {unit_str(eip_size, eip_mid)}")
            products.append(bw)
        vm["productNum"] = quantity
        vm["inquiryTag"] = "normal"
        vm["selfProductNum"] = 1

        evs = {"calculator_evs_stepper_main": {"type": products[2].get("type"),
                                               "UNSET_Stepper_0": _stepper(GB, system_disk[1])}}
        for k, (_dt, ds) in enumerate(data_disks or []):
            evs[f"calculator_evs_stepper_|addible0|_{k}"] = {"type": products[3 + k].get("type"),
                                                             "UNSET_Stepper_0": _stepper(GB, ds)}
        render: dict[str, Any] = {
            "calculator_ecs_radio": {k: vm.get(k) for k in ("arch", "vmType", "generation", "cpu", "mem")},
            "calculator_eip_switch": {"UNSET_Switch": "calc_14_" if has_bw else "calc_15_"},
            "calculator_ims_select": {"__platform": img["__platform"], "name": img["name"]},
            "calculator_ecs_RIRadio": {"paymentType": vm["paymentType"], "RITime": vm["RITime"]},
            "calculator_evs_stepper": evs,
        }
        if has_bw:
            render["calculator_eip_radio"] = {"eipSpec": "dataInfo_14_", "shareType": "dataInfo_16_",
                                              "eipType": eip_tok, eip_sub: _stepper(eip_mid, eip_size)}
        period_num = 1 if ri_key == "1_3" else 3
        return self.assemble(region, "ri", period_num, 730, quantity, products, self.description, render,
                             title=title, include_time=False, include_quantity=True,
                             price_fn=lambda prods: self._price_ri(prods, region, ri_key))

    def _price_ri(self, products: list[dict[str, Any]], region: str, ri_time: str) -> None:
        period_num = 1 if ri_time == "1_3" else 3
        install = 12 * period_num
        for p in products:
            if p.get("inquiryTag") == "localImage":
                p["inquiryResult"] = {"amount": 0, "originalAmount": 0, "discountAmount": 0,
                                      "installNum": install, "perAmount": 0, "perDiscountAmount": 0,
                                      "perOriginalAmount": 0, "installAmount": 0, "installPeriodType": 2,
                                      "id": f"RI-{p['selectIndex']}-noId", "productId": "noId"}
                continue
            # The calculator derives the RI line as: perAmount (monthly) * installMonths.
            if p.get("perPrice") is not None:
                per = round(p["perPrice"] * p.get("productNum", 1), 6)
            else:  # on-demand disk priced for 730 h, multiplied by quantity
                per = round(p.get("amount", 0) * 730 * (p.get("resourceSize") or 1) * p.get("productNum", 1), 6)
            p["inquiryResult"] = {"amount": round(per * install, 6), "originalAmount": round(per * install, 6),
                                  "discountAmount": 0, "installNum": install, "perAmount": per,
                                  "perDiscountAmount": 0, "perOriginalAmount": 0, "installAmount": 0,
                                  "installPeriodType": 2, "id": f"RI-{p['selectIndex']}-{p.get('productId')}",
                                  "productId": p.get("productId")}
