"""Client for the public (unauthenticated) backend of the Huawei Cloud pricing calculator.

Reverse engineered from https://www.huaweicloud.com/intl/en-us/pricing/calculator.html
(bundle: portal.hc-cdn.com/CBC-PortalCalculator/<ver>/framework.js). See README.md.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import httpx

from autocalc.errors import CalculatorError, UpstreamError, raise_for_exception

API = "https://portal-intl.huaweicloud.com/api"
CALC = f"{API}/calculator/rest/cbc/portalcalculatornodeservice/v4/api"
INQUIRY = f"{API}/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource"
EXCHANGE = f"{API}/cbc/global/rest/cbc/csbpaymentservice/v1/exchange-rate"
# Static disaster-recovery mirror the frontend falls back to (same JSON, served by CDN).
CDN = "https://res-static.hc-cdn.cn/pricecalculator/intl/product"

TAG = "general.online.portal"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (autocalc)",
    "Origin": "https://www.huaweicloud.com",
    "Referer": "https://www.huaweicloud.com/intl/en-us/pricing/calculator.html",
}

Billing = Literal["ondemand", "monthly", "yearly", "ri"]
# billing -> (chargingMode, periodType) as used by the frontend's CHARGEMODEMAP.
BILLING = {"monthly": (0, 2), "yearly": (0, 3), "ondemand": (1, 4), "ri": (10, 3)}
PLAN_MODE = {"monthly": "MONTHLY", "yearly": "YEARLY", "ondemand": "ONDEMAND"}
HOUR_MEASURE_ID = 4
GB_MEASURE_ID = 17

_TOKEN = re.compile(r"\b((?:dataInfo|calc|detail)_\d+_)")
_UNIT = re.compile(r"BSSUNIT\.(plural)?[uU]nit\.(\d+)")


@dataclass
class Sku:
    service: str
    group: str
    cloud_service_type: str
    resource_type: str
    spec: str
    description: str
    prices: dict[str, dict[str, Any]] = field(default_factory=dict)
    off_page: bool = False  # priced in the catalog, but the calculator page does not list it (ECS flavors without a family)

    def as_dict(self) -> dict[str, Any]:
        return {
            "service": self.service,
            "group": self.group,
            "spec": self.spec,
            "description": self.description,
            "prices": self.prices,
        }


class Calculator:
    def __init__(self, cache_dir: str | os.PathLike | None = None, ttl: float = 24 * 3600, timeout: float = 60):
        self.http = httpx.Client(headers=HEADERS, timeout=timeout, follow_redirects=True)
        self.cache_dir = Path(cache_dir or os.environ.get("AUTOCALC_CACHE", Path.home() / ".cache" / "autocalc"))
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.ttl = ttl

    # ---- raw transport -------------------------------------------------

    def _get_json(self, url: str, params: dict[str, Any] | None = None, fallback: str | None = None,
                  refresh: bool = False) -> Any:
        key = hashlib.sha1(f"{url}?{json.dumps(params, sort_keys=True)}".encode()).hexdigest()
        path = self.cache_dir / f"{key}.json"
        if not refresh and path.exists() and time.time() - path.stat().st_mtime < self.ttl:
            return json.loads(path.read_text())
        # CDN mirror first when available: faster and survives an API outage (D2).
        for target in ([fallback] if (not refresh and fallback) else []) + [url]:
            try:
                r = self.http.get(target, params=params if target == url else None)
                r.raise_for_status()
                data = r.json()
                break
            except (httpx.HTTPError, ValueError):
                continue
        else:
            raise UpstreamError(f"could not fetch {url}", hint="Check network reachability (`autocalc doctor`).",
                                details={"url": url})
        path.write_text(json.dumps(data))
        return data

    # ---- catalog -------------------------------------------------------

    def menu(self, language: str = "en-us", refresh: bool = False) -> dict[str, Any]:
        return self._get_json(
            f"{CALC}/menuInfo",
            {"sign": "common", "language": language},
            fallback=f"{CDN}/common_{language}_menuInfo.json",
            refresh=refresh,
        )

    def labels(self, language: str = "en-us") -> dict[str, dict[str, str]]:
        return self._get_json(f"{CALC}/language", {"urlPath": "all", "language": language})

    def services(self) -> list[dict[str, Any]]:
        out = []
        for cat in self.menu()["menuInfos"]:
            for s in cat["subCategoryLists"]:
                if not s.get("hasCalculator") or s.get("hideCalculator"):
                    continue
                out.append({
                    "service": s["urlPath"],
                    "name": s["categoryName"],
                    "category": cat["parentCategoryName"],
                    "regions": (s.get("regionOnline") or {}).get("regionList", []),
                })
        return out

    def regions(self) -> dict[str, str]:
        menu = self.menu()
        names = menu.get("global", {})
        return {r: names.get(r, r) for r in menu.get("regionsOfSite", {}).get("HWC", [])}

    def product_info(self, service: str, region: str) -> dict[str, Any]:
        return self._get_json(
            f"{CALC}/productInfo",
            {"urlPath": service, "tag": TAG, "region": region, "tab": "calc", "sign": "common"},
            fallback=f"{CDN}/{service}_{TAG}_{region}_calc_productInfo.json",
        )

    def _resolver(self, service: str):
        labels = self.labels().get(service, {})
        units = self.menu().get("measureID", {})

        def unit(m: re.Match) -> str:
            u = units.get(m.group(2), {})
            return " " + (u.get("pluralUnit" if m.group(1) else "unit") or "")

        def resolve(text: str) -> str:
            text = _TOKEN.sub(lambda m: labels.get(m.group(1), m.group(1)), text or "")
            return _UNIT.sub(unit, text).strip()

        return resolve, units

    def skus(self, service: str, region: str) -> list[Sku]:
        info = self.product_info(service, region)
        resolve, units = self._resolver(service)
        out = []
        for group, items in (info.get("product") or {}).items():
            for it in items:
                prices = {}
                for p in it.get("planList") or []:
                    if "amount" not in p or p.get("planType") != "PRICEPLAN":
                        continue
                    entry: dict[str, Any] = {"amount": p["amount"], "currency": "USD"}
                    if p.get("billingEvent", "").endswith("onetime"):
                        entry["per"] = f"{p.get('periodNum') or 1} {'month' if p['billingMode'] == 'MONTHLY' else 'year'}"
                    else:
                        step, mu = p.get("measureUnitStep"), p.get("measureUnit")
                        entry["per"] = f"{step or 1} {units.get(str(mu), {}).get('unit', mu)}"
                        entry["usage_factor"] = p.get("usageFactor")
                    prices.setdefault(p["billingMode"].lower(), entry)
                out.append(Sku(
                    service=service,
                    group=group,
                    cloud_service_type=it.get("cloudServiceType", ""),
                    resource_type=it.get("resourceType", ""),
                    spec=it.get("resourceSpecCode", ""),
                    description=resolve(it.get("productSpecSysDesc", "")),
                    prices=prices,
                    off_page=group == "ec2_vm" and service == "ecs" and not it.get("vmType"),
                ))
        return out

    def search(
        self,
        service: str,
        region: str,
        query: str = "",
        billing: Billing | None = None,
        min_vcpus: float | None = None,
        min_memory_gb: float | None = None,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        terms = [t.lower() for t in query.split()]
        hits = []
        for s in self.skus(service, region):
            hay = f"{s.group} {s.spec} {s.description}".lower()
            if any(t not in hay for t in terms):
                continue
            if billing and billing not in s.prices:
                continue
            vcpus, mem = _parse_compute(s.description)
            if min_vcpus is not None and (vcpus is None or vcpus < min_vcpus):
                continue
            if min_memory_gb is not None and (mem is None or mem < min_memory_gb):
                continue
            hits.append(s)
        mode = billing or "ondemand"
        hits.sort(key=lambda s: (s.prices.get(mode, {}).get("amount") is None, s.prices.get(mode, {}).get("amount") or 0))
        return [h.as_dict() for h in hits[:limit]]

    def find_sku(self, service: str, region: str, spec: str) -> Sku:
        matches = [s for s in self.skus(service, region) if s.spec == spec]
        if not matches:
            raise CalculatorError(f"spec {spec!r} not found for service {service!r} in {region}")
        return matches[0]

    # ---- live rating ---------------------------------------------------

    def inquiry(self, body: dict[str, Any], retries: int = 2) -> dict[str, Any]:
        last: Exception | None = None
        for attempt in range(retries + 1):
            try:
                r = self.http.post(INQUIRY, json=body)
            except httpx.HTTPError as exc:  # network / timeout
                last = exc
                if attempt < retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise UpstreamError(f"inquiry failed: {exc}", hint="Retry; if it persists the endpoint may be down.") from exc
            try:
                data = r.json()
            except ValueError as err:
                last = UpstreamError(f"inquiry returned HTTP {r.status_code} (non-JSON)")
                if attempt < retries and (r.status_code == 429 or r.status_code >= 500):
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise last from err
            if (r.status_code == 429 or r.status_code >= 500) and attempt < retries:
                last = UpstreamError(f"inquiry HTTP {r.status_code}")
                time.sleep(0.5 * (attempt + 1))
                continue
            raise_for_exception(data)
            if r.status_code != 200:
                raise UpstreamError(f"inquiry HTTP {r.status_code}: {str(data)[:200]}")
            return data
        raise last or UpstreamError("inquiry failed")

    def quote(
        self,
        region: str,
        items: list[dict[str, Any]],
        billing: Billing = "ondemand",
        hours: float = 730,
        periods: int = 1,
    ) -> dict[str, Any]:
        """Price a set of resources with the official rating engine.

        Each item: {service, spec, quantity=1, size=None (GB, for disks etc.),
        usage_factor=None, usage_value=None, usage_measure_id=None}.
        ondemand: Duration items are priced for `hours`; storage-style usage
        (usage_factor starting with "size") is per hour too and is scaled by `hours`;
        other usage factors (traffic, requests...) are priced for usage_value as given.
        monthly/yearly: `periods` months or years.
        """
        charging_mode, period_type = BILLING[billing]
        products, scale, meta = [], {}, {}
        for i, it in enumerate(items):
            sku = self.find_sku(it["service"], region, it["spec"])
            pid = f"item{i}"
            p: dict[str, Any] = {
                "id": pid,
                "cloudServiceType": sku.cloud_service_type,
                "resourceType": sku.resource_type,
                "resourceSpecCode": sku.spec,
                "productNum": int(it.get("quantity", 1)),
            }
            if it.get("size") is not None:
                p["resourceSize"] = it["size"]
                p["resouceSizeMeasureId"] = it.get("size_measure_id", GB_MEASURE_ID)
            scale[pid] = 1.0
            if billing == "ondemand":
                plan = sku.prices.get("ondemand")
                if plan is None:
                    raise CalculatorError(f"{sku.spec} has no on-demand price in {region}")
                factor = it.get("usage_factor") or plan.get("usage_factor") or "Duration"
                if factor == "Duration":
                    p.update(usageFactor="Duration", usageMeasureId=HOUR_MEASURE_ID, usageValue=1)
                    scale[pid] = hours
                else:
                    if it.get("usage_value") is None:
                        raise CalculatorError(f"{sku.spec}: usage_value required for usage factor {factor!r}")
                    p.update(usageFactor=factor, usageValue=it["usage_value"],
                             usageMeasureId=it.get("usage_measure_id", GB_MEASURE_ID))
                    if factor.startswith("size"):
                        scale[pid] = hours
            products.append(p)
            meta[pid] = {"service": sku.service, "spec": sku.spec, "description": sku.description,
                         "quantity": p["productNum"], "size": it.get("size")}

        body = {
            "regionId": region,
            "chargingMode": charging_mode,
            "periodType": period_type,
            "periodNum": 1 if billing == "ondemand" else periods,
            "subscriptionNum": 1,
            "siteCode": "HWC",
            "productInfos": products,
        }
        res = self.inquiry(body)
        lines, total, original = [], 0.0, 0.0
        for r in res.get("productRatingResult", []):
            k = scale.get(r["id"], 1.0)
            amt, orig = r["amount"] * k, (r.get("originalAmount") or r["amount"]) * k
            total, original = total + amt, original + orig
            lines.append({**meta[r["id"]], "amount": round(amt, 4), "list_price": round(orig, 4)})
        return {
            "region": region,
            "billing": billing,
            "term": f"{hours} hours" if billing == "ondemand" else f"{periods} {'month' if billing == 'monthly' else 'year'}(s)",
            "currency": res.get("currency", "USD"),
            "total": round(total, 4),
            "list_price": round(original, 4),
            "discount": round(original - total, 4),
            "items": lines,
        }

    # ---- currency ------------------------------------------------------

    def exchange_rates(self) -> dict[str, float]:
        rates, page = {}, 1
        while True:
            d = self._get_json(EXCHANGE, {"page_no": page, "page_size": 100})
            rows = d.get("data") or []
            rates.update({x["currency"]: x["rate"] for x in rows if x.get("baseCurrency") == "USD"})
            if not rows or len(rates) >= int(d.get("totalSize") or 0) or page > 20:
                return rates
            page += 1


def _parse_compute(desc: str) -> tuple[float | None, float | None]:
    v = re.search(r"vCPUs:\s*([\d.]+)", desc)
    m = re.search(r"Memory:\s*([\d.]+)\s*MB", desc)
    return (float(v.group(1)) if v else None, float(m.group(1)) / 1024 if m else None)
