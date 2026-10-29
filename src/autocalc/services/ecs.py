"""ECS card builder (B1): VM + image + system and data disks + EIP bandwidth.

Uses the shared framework. Reserved instances remain unavailable pending upstream rating.
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
    modes = ("monthly", "yearly", "ondemand")

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
            from autocalc.errors import ValidationError
            raise ValidationError("RI publication is unavailable until upstream rating is supported.", field="billing", allowed=list(self.modes))
        charge_mode, mode_name, period_type, time_measure = CHARGE[billing]
        spec = flavor if flavor.endswith((".linux", ".win", ".byol")) else f"{flavor}.win" if image.lower().startswith("windows") else f"{flavor}.linux"
        vm = self.product(self.catalog(region, "ec2_vm", spec), billing, periods, hours)
        vm["addToList_title"] = "calc_2_"
        vm["addToList_product"] = " | ".join([vm["arch"], vm["vmType"], vm["spec"], vm["cpu"], vm["mem"]])

        imgs = self.images(region, vm["spec"], image) or self.images(region, None, image)
        if not imgs:
            raise CalculatorError(f"no image matching {image!r} in {region}")
        exact = [candidate for candidate in imgs if candidate["name"].casefold() == image.casefold()
                 or str(candidate["id"]) == image]
        if len(exact) == 1:
            imgs = exact
        if len(imgs) != 1:
            from autocalc.errors import ValidationError
            raise ValidationError(f"Image {image!r} matches multiple catalog images; choose an exact name.",
                                  field="image", allowed=sorted({candidate["name"] for candidate in imgs}))
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

    def build_ri(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        """Reserved instances require upstream rating and are intentionally unavailable."""
        from autocalc.errors import ValidationError
        raise ValidationError("RI quotes require upstream rating; local price formulas are disabled.", field="billing")

    def _price_ri(self, *args: Any, **kwargs: Any) -> None:
        from autocalc.errors import ValidationError
        raise ValidationError("RI cards cannot be verified with local price formulas.", field="billing")
