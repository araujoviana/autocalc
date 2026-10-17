"""Tool registry: every tool is a plain function registered once; MCP and the CLI both read it.

Read tools (catalog, rating, currency, anonymous share/detail) need no credentials.
Write tools (update/delete a saved list) use the one-time browser session
(``autocalc login``); they return AUTH_EXPIRED with a fix hint when it is missing.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any, Literal

from autocalc.client import Calculator
from autocalc.errors import CalculatorError
from autocalc.regions import RegionResolver

calc = Calculator()


def _region(value: str) -> str:
    return RegionResolver.from_menu(calc.menu()).resolve(value)


REGISTRY: dict[str, Callable[..., Any]] = {}


def tool(fn: Callable[..., Any]) -> Callable[..., Any]:
    REGISTRY[fn.__name__] = fn
    return fn


# ---- discovery --------------------------------------------------------------


@tool
def list_services(query: str = "") -> list[dict[str, Any]]:
    """List Huawei Cloud services that have a price calculator (service id, name, category).

    Use the returned `service` id (e.g. 'ecs', 'rds', 'obs', 'cce') in the other tools.
    `query` filters by substring on id/name/category.
    """
    q = query.lower()
    return [{k: s[k] for k in ("service", "name", "category")}
            for s in calc.services() if q in f"{s['service']} {s['name']} {s['category']}".lower()]


@tool
def list_regions(service: str = "", region: str = "") -> Any:
    """Region ids -> display names. With `service`, only regions where it is sold.

    `region` accepts a friendly name (e.g. 'Santiago') and resolves it (E1).
    """
    regions = calc.regions()
    if region:
        return {"resolved": _region(region), "display": regions.get(_region(region), region)}
    if service:
        allowed = next((s["regions"] for s in calc.services() if s["service"] == service), [])
        regions = {r: regions.get(r, r) for r in allowed}
    return regions


@tool
def search_skus(service: str, region: str, query: str = "", billing: Literal["ondemand", "monthly", "yearly"] | None = None,
                min_vcpus: float | None = None, min_memory_gb: float | None = None, limit: int = 30) -> Any:
    """Search the official price list of a service in a region. Sorted cheapest first.

    `region` accepts a friendly name ('Sao Paulo'). `query` terms must all appear in
    spec/description. Returns spec codes with list prices per billing mode (USD).
    """
    return calc.search(service, _region(region), query, billing, min_vcpus, min_memory_gb, limit)


@tool
def describe_service(service: str, region: str = "sa-brazil-1") -> Any:
    """What a service supports in a region: modes, groups and a sample of specs.

    Use before building a list, so the agent knows the valid options for that region (C2).
    """
    from autocalc.availability import Availability
    from autocalc.services import supported_services
    reg = _region(region)
    av = Availability(calc)
    out: dict[str, Any] = {"service": service, "region": reg, "modes_in_region": av.modes_in_region(service, reg),
                           "sold_in_region": av.service_in_region(service, reg)}
    info = calc.product_info(service, reg).get("product") or {}
    groups = {}
    for g, items in info.items():
        specs = [it.get("resourceSpecCode") for it in items if it.get("resourceSpecCode")]
        groups[g] = {"count": len(items), "sample_specs": specs[:8]}
    out["groups"] = groups
    out["builders"] = [s for s in supported_services() if s["service"] == service]
    return out


@tool
def supported_services() -> list[dict[str, Any]]:
    """The capability matrix: which services autocalc can build a saved list for, and their modes."""
    from autocalc.services import supported_services as ss
    return ss()


# ---- pricing ----------------------------------------------------------------


@tool
def quote(region: str, items: list[dict[str, Any]], billing: Literal["ondemand", "monthly", "yearly"] = "ondemand",
          hours: float = 730, periods: int = 1) -> Any:
    """Price a bill of materials with Huawei Cloud's official rating engine (USD).

    items: [{service, spec, quantity=1, size=None, usage_factor=None, usage_value=None}]
      - spec comes from search_skus; size is capacity in GB for disks/volumes.
      - usage_value for usage-billed items (OBS storage GB, traffic GB, requests).
    billing='ondemand' prices `hours` (730 = one month); 'monthly'/'yearly' price
    `periods` months/years and include the official yearly discount.
    """
    return calc.quote(_region(region), items, billing, hours, periods)


@tool
def convert_currency(amount_usd: float, currency: str) -> Any:
    """Convert a USD amount using Huawei Cloud's own published exchange rate (e.g. BRL, EUR)."""
    rates = calc.exchange_rates()
    rate = rates.get(currency.upper())
    if rate is None:
        return {"error": f"no rate for {currency}", "available": sorted(rates)}
    return {"usd": amount_usd, "currency": currency.upper(), "rate": rate, "amount": round(amount_usd * rate, 2)}


@tool
def compare_modes(items: list[dict[str, Any]], modes: list[str] | None = None, region: str = "sa-brazil-1",
                  currency: str = "USD") -> Any:
    """Compare the same bill of materials across billing modes (C4).

    `items` are quote items ([{service, spec, quantity, size, usage_*}]).
    Returns the cost per mode and the saving vs on-demand. Modes: ondemand, monthly, yearly.
    """
    modes = modes or ["ondemand", "monthly", "yearly"]
    reg = _region(region)
    rows = []
    base = None
    for m in modes:
        try:
            q = calc.quote(reg, items, m)  # type: ignore[arg-type]
        except CalculatorError as exc:
            rows.append({"mode": m, "error": exc.message})
            continue
        total = q["total"]
        if m == "yearly":
            total = total / 12  # monthly-equivalent
        rows.append({"mode": m, "total_usd": q["total"], "monthly_equivalent_usd": round(total, 2)})
        if m == "ondemand":
            base = total
    for r in rows:
        if base and "monthly_equivalent_usd" in r:
            r["saving_vs_ondemand_pct"] = round((1 - r["monthly_equivalent_usd"] / base) * 100, 1)
    out: dict[str, Any] = {"region": reg, "modes": rows}
    if currency.upper() != "USD":
        rate = calc.exchange_rates().get(currency.upper())
        out["currency"] = currency.upper()
        out["rate"] = rate
    return out


@tool
def compare_regions(items: list[dict[str, Any]], regions: list[str], mode: Literal["ondemand", "monthly", "yearly"] = "monthly") -> Any:
    """Price the same bill of materials in several regions (E3). Friendly names accepted."""
    rows = []
    for r in regions:
        try:
            q = calc.quote(_region(r), items, mode)
            rows.append({"region": q["region"], "total_usd": q["total"], "currency": q["currency"]})
        except CalculatorError as exc:
            rows.append({"region": r, "error": exc.code, "message": exc.message, "hint": exc.hint})
    return {"mode": mode, "regions": rows}


# ---- saved lists ------------------------------------------------------------


_ID = re.compile(r"shareListId=([0-9a-fA-F]+)")


def _list_id(value: str) -> str:
    m = _ID.search(value or "")
    return m.group(1) if m else (value or "").strip()


@tool
def read_price_list(url_or_id: str) -> Any:
    """Read any shared price list by url or id (anonymous; works for links others send).

    Returns a normalized summary: one row per item (service, spec, mode, quantity, price) (C3).
    """
    from autocalc.share import share_detail
    d = share_detail(calc, _list_id(url_or_id))
    items = []
    for it in d.get("cartListData") or []:
        sp = it.get("selectedProduct") or {}
        rows = []
        for p in sp.get("productAllInfos") or []:
            rows.append({"spec": p.get("resourceSpecCode"), "num": p.get("productNum"),
                         "size": p.get("resourceSize"), "amount": (p.get("inquiryResult") or {}).get("amount")})
        items.append({"service": sp.get("serviceCode"), "region": sp.get("region"),
                      "mode": sp.get("chargeModeName"), "title": sp.get("_customTitle"),
                      "amount": sp.get("amount"), "products": rows})
    return {"id": _list_id(url_or_id), "name": d.get("name"), "items": items,
            "total": (d.get("totalPrice") or {}).get("amount") if isinstance(d.get("totalPrice"), dict) else d.get("totalPrice")}


@tool
def list_my_price_lists() -> Any:
    """List the saved price lists on the user's calculator account (name, id, url, total)."""
    from autocalc.share import SHARE_URL, Session
    return [{"name": x.get("name"), "id": x.get("key"), "url": SHARE_URL.format(id=x.get("key"), currency="USD"),
             "total": x.get("totalPrice"), "updated": x.get("updateTime")} for x in Session().lists()]


@tool
def delete_price_list(url_or_id: str) -> Any:
    """Delete a saved price list by url or id (asks the user to confirm through the agent)."""
    from autocalc.share import Session
    Session().delete(_list_id(url_or_id))
    return {"deleted": _list_id(url_or_id)}


@tool
def rename_price_list(url_or_id: str, new_name: str) -> Any:
    """Rename a saved price list."""
    from autocalc.share import Session, share_detail
    lid = _list_id(url_or_id)
    detail = share_detail(calc, lid)
    detail["name"] = new_name
    Session().update(lid, detail)
    return {"id": lid, "name": new_name}


@tool
def duplicate_price_list(url_or_id: str, new_name: str | None = None) -> Any:
    """Copy a saved price list (optionally with a new name)."""
    from autocalc.share import SHARE_URL, Session
    s = Session()
    lid = _list_id(url_or_id)
    new_id = s._call("POST", "share/copy", params={"key": lid})["data"]
    if new_name:
        from autocalc.share import share_detail
        d = share_detail(calc, new_id)
        d["name"] = new_name
        s.update(new_id, d)
    return {"id": new_id, "name": new_name, "url": SHARE_URL.format(id=new_id, currency="USD")}


# ---- auth -------------------------------------------------------------------


@tool
def auth_status() -> Any:
    """Whether the browser profile is signed in (account mask, browser, cookie names). Read-only tools never need it."""
    from autocalc import auth
    try:
        return auth.status()
    except CalculatorError as exc:
        return exc.as_dict()


@tool
def auth_login() -> Any:
    """Open a browser window so the user can sign in once (A1). Blocks until done or a 5-minute timeout.

    Use when a write tool returns AUTH_EXPIRED. Read-only tools (catalog, quote, read_price_list) never need this.
    """
    from autocalc import auth
    try:
        res = auth.login(timeout=300)
        return {"logged_in": True, "account_mask": res.account_mask, "browser": res.browser}
    except CalculatorError as exc:
        return exc.as_dict()
