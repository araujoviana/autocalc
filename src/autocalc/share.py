"""Build calculator "saved lists" (cartListData) that the website renders, and publish them as share links.

The item format was learned from real saved lists (GET share/detail, which is anonymous):
a product = catalog SKU (from productInfo) minus planList, plus bakPlanList (plans for the
chosen mode), the chosen plan's fields, selection fields and display-label tokens.
"""

from __future__ import annotations

import json
import os
import secrets
import time
from pathlib import Path
from typing import Any

from autocalc.client import CALC, Billing, Calculator, CalculatorError
from autocalc.errors import AuthExpired

SHARE_URL = "https://www.huaweicloud.com/intl/en-us/pricing/calculator.html?shareListId={id}&currentCurrency=USD"
CONSOLE = "https://console-intl.huaweicloud.com/ecm/"
QUANTITY_MEASURE = {"measureId": 41, "measureNameBeforeTrans": "calc_29_", "measurePluralNameBeforeTrans": "calc_30_"}
PLAN_KEYS = ("productId", "billingMode", "siteCode", "periodNum", "billingEvent", "measureUnit")
CHARGE = {  # billing -> (chargeMode, chargeModeName, periodType, measureId of purchaseTime)
    "monthly": ("PERIOD", "MONTHLY", 2, 20),
    "yearly": ("PERIOD", "YEARLY", 3, 19),
    "ondemand": ("ONDEMAND", "ONDEMAND", 4, 4),
}


def _stepper(measure_id: int, value: float, name: str = "", plural: str = "") -> dict[str, Any]:
    return {"measureId": measure_id, "measureValue": value, "measureNameBeforeTrans": name,
            "measurePluralNameBeforeTrans": plural, "transRate": "", "transTarget": ""}


def _unit(value: float, measure_id: int) -> str:
    return f"{value:g}BSSUNIT.{'unit' if value == 1 else 'pluralUnit'}.{measure_id}"


class ListBuilder:
    def __init__(self, calc: Calculator | None = None):
        self.calc = calc or Calculator()

    # ---- catalog helpers ------------------------------------------------

    def _catalog(self, service: str, region: str, group: str, spec: str) -> dict[str, Any]:
        items = self.calc.product_info(service, region)["product"].get(group, [])
        for it in items:
            if it.get("resourceSpecCode") == spec:
                return json.loads(json.dumps(it))
        raise CalculatorError(f"{spec!r} not sold in {region} ({group})")

    def images(self, region: str, flavor: str | None = None, query: str = "") -> list[dict[str, Any]]:
        family = flavor.split(".")[0] if flavor else None
        out = []
        for img in self.calc.product_info("ecs", region)["product"].get("ec2_vm.image.special", []):
            name = _image_name(img)
            if family and family not in img.get("type", []):
                continue
            if all(t.lower() in f"{img.get('__platform')} {name}".lower() for t in query.split()):
                out.append({"id": img["id"], "platform": img.get("__platform"), "name": name, "os": img.get("__os_type")})
        return out

    def _product(self, cat: dict[str, Any], billing: Billing, periods: int, hours: float) -> dict[str, Any]:
        _, mode_name, _, _ = CHARGE[billing]
        plans = cat.pop("planList", [])
        wanted = {"ONDEMAND"} if billing == "ondemand" else {"MONTHLY", "YEARLY"}
        bak = []
        for p in plans:
            if p["billingMode"] not in wanted:
                continue
            b = {k: p.get(k) for k in PLAN_KEYS}
            if p["billingMode"] == "ONDEMAND":
                b.update(usageFactor=p.get("usageFactor"), usageMeasureId=p.get("usageMeasureId"))
            b["amount"] = p["amount"]
            bak.append(b)
        chosen = next((b for b in bak if b["billingMode"] == mode_name and b.get("periodNum") in (None, 1)), None)
        if chosen is None:
            raise CalculatorError(f"{cat.get('resourceSpecCode')} has no {mode_name} price")
        cat["bakPlanList"] = bak
        cat.update({k: v for k, v in chosen.items()})
        if billing == "ondemand":
            cat.update(usageMeasureId=4, transRate="", transTarget="", usageValue=hours,
                       usageMeasureName="", usageMeasurePluralName="")
        return cat

    # ---- ECS --------------------------------------------------------------

    def ecs(
        self,
        region: str,
        flavor: str,
        billing: Billing = "monthly",
        quantity: int = 1,
        periods: int = 1,
        hours: float = 730,
        image: str = "AlmaLinux",
        system_disk: tuple[str, int] = ("GPSSD", 40),
        data_disks: list[tuple[str, int]] | None = None,
        bandwidth_mbit: int | None = 5,
        bandwidth_type: str = "19_bgp",
        title: str | None = None,
    ) -> dict[str, Any]:
        """One ECS card: VM + image + system disk (+ data disks) (+ EIP bandwidth)."""
        charge_mode, mode_name, period_type, time_measure = CHARGE[billing]
        time_value = hours if billing == "ondemand" else periods
        spec = flavor if flavor.endswith((".linux", ".win")) else f"{flavor}.linux"
        vm = self._product(self._catalog("ecs", region, "ec2_vm", spec), billing, periods, hours)
        vm["addToList_title"] = "calc_2_"
        vm["addToList_product"] = " | ".join([vm["arch"], vm["vmType"], vm["spec"], vm["cpu"], vm["mem"]])

        imgs = self.images(region, vm["spec"], image) or self.images(region, None, image)
        if not imgs:
            raise CalculatorError(f"no image matching {image!r} in {region}")
        img_raw = next(i for i in self.calc.product_info("ecs", region)["product"]["ec2_vm.image.special"] if i["id"] == imgs[0]["id"])
        img = json.loads(json.dumps(img_raw))
        img["name"] = _image_name(img)
        img.update(addToList_title="calc_4_", addToList_product=f"{img['__platform']} | {img['name']}")

        products: list[dict[str, Any]] = [vm, img]
        disks = []
        for i, (dtype, size) in enumerate([system_disk, *(data_disks or [])]):
            d = self._product(self._catalog("ecs", region, "ebs_volume", dtype), billing, periods, hours)
            d.update(resourceSize=size, resouceSizeMeasureId=17, resourceMeasureName="", resourceMeasurePluralName="",
                     addToList_title="calc_11_" if i == 0 else "calc_12_",
                     addToList_product=f"{d['type']} | {_unit(size, 17)}", _productType="main" if i == 0 else "data")
            products.append(d)
            disks.append((dtype, size, d["type"]))
        if bandwidth_mbit:
            bw = self._product(self._catalog("ecs", region, "vpc_bandwidth", bandwidth_type), billing, periods, hours)
            bw.update(eipSpec="dataInfo_14_", shareType="dataInfo_16_", eipType="dataInfo_18_", name="dataInfo_14_",
                      resourceSize=bandwidth_mbit, resouceSizeMeasureId=15, resourceMeasureName="",
                      resourceMeasurePluralName="", addToList_title="calc_5_",
                      addToList_product=f"dataInfo_14_ | dataInfo_16_ | dataInfo_18_ | {_unit(bandwidth_mbit, 15)}")
            # keep catalog key order close to the UI's (eip fields precede the label)
            products.append(bw)

        time_tag = int(time.time() * 1000)
        for idx, p in enumerate(products):
            p.update(productNum=quantity, inquiryTag="localImage" if p is img else "normal", selfProductNum=1)
            if p is img and billing == "ondemand":
                # the UI stores on-demand images as quantity x hours
                p.update(productNum=int(quantity * hours), transRate="", transTarget="", durationNum=hours)
            p["selectIndex"] = idx
        self._price(products, region, billing, periods, time_tag)

        selected: dict[str, Any] = {
            "region": region, "locationType": "commonAZ", "chargeMode": charge_mode, "tag": "general.online.portal",
            "serviceCode": "ecs", "timeTag": time_tag, "chargeModeName": mode_name, "periodType": period_type,
            "periodNum": 1 if billing == "ondemand" else periods, "subscriptionNum": 1,
            "purchaseTime": {"measureValue": time_value, "measureId": time_measure,
                             "measureNameBeforeTrans": "", "measurePluralNameBeforeTrans": ""},
            "purchaseNum": {"measureValue": quantity, **QUANTITY_MEASURE},
            "description": "Elastic Cloud Server",
            "productAllInfos": products,
        }
        _totals(selected)
        selected["_cartId"] = secrets.token_hex(16).upper()
        selected["_customTitle"] = title or "custom.ecs 1"

        render: dict[str, Any] = {
            "calculator_ecs_radio": {"arch": vm["arch"], "vmType": vm["vmType"], "generation": vm["generation"],
                                     "cpu": vm["cpu"], "mem": vm["mem"]},
            "calculator_eip_switch": {"UNSET_Switch": "calc_14_" if bandwidth_mbit else "calc_15_"},
        }
        if bandwidth_mbit:
            render["calculator_eip_radio"] = {"eipSpec": "dataInfo_14_", "shareType": "dataInfo_16_",
                                              "eipType": "dataInfo_18_", "UNSET_Stepper_1": _stepper(15, bandwidth_mbit)}
        render["calculator_ims_select"] = {"__platform": img["__platform"], "name": img["name"]}
        render["calculator_evs_stepper"] = {"calculator_evs_stepper_main": {"type": disks[0][2], "UNSET_Stepper_0": _stepper(17, disks[0][1])}}
        rewrite: dict[str, Any] = {
            "global_TITLE": {"tag": "general.online.portal"},
            "global_DESCRIPTION": "Elastic Cloud Server",
            "global_REGIONINFO": {"region": region, "locationType": "commonAZ", "chargeMode": charge_mode},
            "template_RENDER": render,
        }
        if billing == "ondemand":
            rewrite["global_ONDEMANDTIME"] = {"UNSET_Stepper_0": _stepper(4, hours)}
        else:
            rewrite["global_PERIODTIME"] = {"UNSET_PeriodTime": {"measureValue": periods, "measureId": time_measure}}
        rewrite["global_QUANTITY"] = {"UNSET_Stepper_0": _stepper(41, quantity, "calc_29_", "calc_30_")}

        data_disk = ",".join(f"{t}:{s}" for t, s, _ in disks[1:])
        period = "" if billing == "ondemand" else f"{periods}{'m' if billing == 'monthly' else 'y'}"
        buy = (f"{CONSOLE}?region={region}&locale=en-us&charging={0 if billing == 'ondemand' else 1}"
               f"&flavor={vm['spec']}&imageId={img['id']}&sysdisk={disks[0][0]}:{disks[0][1]}&datadisk={data_disk}"
               f"&iptype=5_bgp&ipcharging=bandwidth&bwsize={bandwidth_mbit or 0}&vmcount={quantity}&period={period}#/ecs/createVm")
        return {"buyUrl": buy, "rewriteValue": rewrite, "selectedProduct": selected}

    # ---- pricing ----------------------------------------------------------

    def _price(self, products: list[dict[str, Any]], region: str, billing: Billing, periods: int, time_tag: int) -> None:
        from autocalc.client import BILLING
        charging_mode, period_type = BILLING[billing]
        infos, by_id = [], {}
        for p in products:
            if p["inquiryTag"] != "normal":
                p["inquiryResult"] = {"amount": 0, "originalAmount": 0, "discountAmount": 0, "productId": "noId",
                                      "id": f"{time_tag}-{p['selectIndex']}-noId"}
                continue
            pid = f"{time_tag}-{p['selectIndex']}-{p['productId']}"
            q = {"id": pid, "cloudServiceType": p["cloudServiceType"], "resourceType": p["resourceType"],
                 "resourceSpecCode": p["resourceSpecCode"], "productNum": p["productNum"]}
            if p.get("resourceSize") is not None:
                q.update(resourceSize=p["resourceSize"], resouceSizeMeasureId=p["resouceSizeMeasureId"])
            if billing == "ondemand":
                q.update(usageFactor=p["usageFactor"], usageMeasureId=p["usageMeasureId"], usageValue=p["usageValue"])
            infos.append(q)
            by_id[pid] = p
        res = self.calc.inquiry({"regionId": region, "chargingMode": charging_mode, "periodType": period_type,
                                 "periodNum": 1 if billing == "ondemand" else periods, "subscriptionNum": 1,
                                 "siteCode": "HWC", "productInfos": infos})
        for r in res["productRatingResult"]:
            by_id[r["id"]]["inquiryResult"] = {
                "id": r["id"], "productId": r["productId"], "amount": r["amount"],
                "discountAmount": r.get("discountAmount") or 0, "originalAmount": r.get("originalAmount") or r["amount"],
                "perAmount": r.get("perAmount"), "perDiscountAmount": r.get("perDiscountAmount"),
                "perOriginalAmount": r.get("perOriginalAmount"), "perPeriodType": r.get("perPeriodType"),
                "measureId": r.get("measureId", 1), "extendParams": r.get("extendParams"),
            }

    # ---- whole list ---------------------------------------------------------

    @staticmethod
    def share_payload(name: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        total = {"amount": 0.0, "discountAmount": 0.0, "originalAmount": 0.0, "perAmount": 0, "monthlyAmount": 0}
        for i, it in enumerate(items, 1):
            sp = it["selectedProduct"]
            if sp.get("_customTitle", "").startswith("custom."):
                sp["_customTitle"] = f"custom.{sp['serviceCode']} {i}"
            for k in ("amount", "discountAmount", "originalAmount"):
                total[k] = round(total[k] + (sp.get(k) or 0), 6)
        return {"billingMode": "cart.shareList.billingModeTotal", "cartListData": items, "name": name, "totalPrice": total}


def _totals(selected: dict[str, Any]) -> None:
    for k in ("amount", "discountAmount", "originalAmount"):
        selected[k] = round(sum((p.get("inquiryResult") or {}).get(k) or 0 for p in selected["productAllInfos"]), 6)


def _image_name(img: dict[str, Any]) -> str:
    name = img.get("name", "")
    if name.startswith("{"):
        try:
            return json.loads(name).get("en-us", name)
        except ValueError:
            pass
    return name


# ---- authenticated session ----------------------------------------------------


class Session:
    """Logged-in calculator session.

    Source order: explicit cookie header, then ``AUTOCALC_SESSION`` cURL file,
    then a legacy repo ``.session.curl``, then the stored session (keyring/file).
    """

    def __init__(self, curl_file: str | Path | None = None, cookie_header: str | None = None):
        headers: dict[str, str] = {}
        if cookie_header:
            headers["cookie"] = cookie_header
        else:
            src = None
            if curl_file:
                src = Path(curl_file).expanduser()
            elif os.environ.get("AUTOCALC_SESSION"):
                src = Path(os.environ["AUTOCALC_SESSION"]).expanduser()
            elif DEFAULT_SESSION.exists():
                src = DEFAULT_SESSION
            if src is not None:
                text = src.read_text()
                import shlex
                tokens = shlex.split(text.replace("\\\n", " "))
                for i, t in enumerate(tokens):
                    if t in ("-H", "--header") and i + 1 < len(tokens):
                        k, _, v = tokens[i + 1].partition(":")
                        headers[k.strip().lower()] = v.strip()
                    elif t in ("-b", "--cookie") and i + 1 < len(tokens):
                        headers["cookie"] = tokens[i + 1]
            if "cookie" not in headers:
                from autocalc.auth import SessionStore
                stored = SessionStore().load()
                if stored:
                    headers["cookie"] = stored.cookie_header
                else:
                    raise AuthExpired("no calculator session found",
                                      hint="Run `autocalc login` (once) or import a 'Copy as cURL'.")
        if "csrf" not in headers:
            for part in headers["cookie"].split(";"):
                k, _, v = part.strip().partition("=")
                if k == "csrf":
                    headers["csrf"] = v
        import httpx
        keep = {k: v for k, v in headers.items() if k in ("cookie", "csrf", "user-agent")}
        keep.setdefault("user-agent", "Mozilla/5.0")
        keep.update({"origin": "https://www.huaweicloud.com", "referer": "https://www.huaweicloud.com/",
                     "content-type": "application/json"})
        self.http = httpx.Client(headers=keep, timeout=60)

    def _call(self, method: str, path: str, params: dict | None = None, body: Any = None,
              _retry: bool = True) -> dict[str, Any]:
        r = self.http.request(method, f"{CALC}/{path}", params=params, json=body)
        try:
            data = r.json()
        except ValueError as err:
            raise CalculatorError(f"{path}: HTTP {r.status_code} {r.text[:300]}") from err
        code = str(data.get("retCode", "200"))
        if code == "CBC.0101" and _retry:
            # session went stale -> try a silent refresh (A2) then retry once
            self._renew()
            return self._call(method, path, params, body, _retry=False)
        if r.status_code != 200 or code != "200":
            if code == "CBC.0101":
                raise AuthExpired("Calculator session is not valid.",
                                  hint="Run `autocalc login` to sign in again.")
            raise CalculatorError(f"{path}: HTTP {r.status_code} {data}")
        return data

    def _renew(self) -> None:
        from autocalc import auth
        sess = auth.refresh()
        import httpx

        keep = {"cookie": sess.cookie_header, "user-agent": self.http.headers.get("user-agent", "Mozilla/5.0"),
                "origin": "https://www.huaweicloud.com", "referer": "https://www.huaweicloud.com/",
                "content-type": "application/json"}
        self.http = httpx.Client(headers=keep, timeout=60)

    def lists(self) -> list[dict[str, Any]]:
        return self._call("GET", "share/list").get("lists", [])

    def create(self, payload: dict[str, Any]) -> str:
        list_id = self._call("POST", "share/add", body=payload)["data"]
        return list_id

    def update(self, list_id: str, payload: dict[str, Any]) -> None:
        self._call("POST", "share/update", params={"key": list_id}, body=payload)

    def delete(self, list_id: str) -> None:
        self._call("POST", "share/delete", params={"key": list_id})


def share_detail(calc: Calculator, list_id: str) -> dict[str, Any]:
    r = calc.http.get(f"{CALC}/share/detail", params={"key": list_id, "language": "en-us"})
    data = r.json()
    if str(data.get("retCode")) != "200":
        raise CalculatorError(f"share/detail: {data}")
    return data["data"]


DEFAULT_SESSION = Path(__file__).resolve().parents[2] / ".session.curl"


def publish(name: str, ecs_items: list[dict[str, Any]], session_file: str | Path | None = None,
            calc: Calculator | None = None) -> dict[str, Any]:
    """Build ECS cards from plain dicts (ListBuilder.ecs kwargs), save them as a list and return its share link."""
    import os
    b = ListBuilder(calc)
    items = []
    for spec in ecs_items:
        kw = dict(spec)
        for key in ("system_disk",):
            if isinstance(kw.get(key), (list, dict)):
                v = kw[key]
                kw[key] = (v["type"], int(v["size"])) if isinstance(v, dict) else (v[0], int(v[1]))
        if kw.get("data_disks"):
            kw["data_disks"] = [(d["type"], int(d["size"])) if isinstance(d, dict) else (d[0], int(d[1])) for d in kw["data_disks"]]
        items.append(b.ecs(**kw))
    payload = b.share_payload(name, items)
    session = Session(session_file or os.environ.get("AUTOCALC_SESSION") or DEFAULT_SESSION)
    list_id = session.create(payload)
    return {"id": list_id, "url": SHARE_URL.format(id=list_id), "name": name,
            "total_usd": payload["totalPrice"]["amount"],
            "items": [{"flavor": it["selectedProduct"]["productAllInfos"][0]["spec"],
                       "billing": it["selectedProduct"]["chargeModeName"],
                       "quantity": it["selectedProduct"]["purchaseNum"]["measureValue"],
                       "amount_usd": it["selectedProduct"]["amount"]} for it in items]}
