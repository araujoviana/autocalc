"""Tool registry: every tool is a plain function registered once; MCP and the CLI both read it.

Read tools (catalog, rating, currency, anonymous share/detail) need no credentials.
Write tools (update/delete a saved list) use the one-time browser session
(``autocalc login``); they return AUTH_EXPIRED with a fix hint when it is missing.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable
from typing import Any, Literal

from autocalc.client import Calculator
from autocalc.errors import CalculatorError, ValidationError
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
def list_regions(service: str = "") -> Any:
    """Region ids -> display names. With `service`, only regions where it is sold.

    Other tools take friendly names ('Santiago') directly, so there is nothing to resolve here.
    """
    regions = calc.regions()
    if service:
        allowed = next((s["regions"] for s in calc.services() if s["service"] == service), [])
        regions = {r: regions.get(r, r) for r in allowed}
    return regions


# the same on every row of a result, so they only cost tokens
_NOISE = ("Remark:", "Spot Duartion:", "Spot Duration:")


def flat_sku(sku: dict[str, Any]) -> dict[str, Any]:
    """A search row for the agent: spec, a trimmed description and one USD amount per billing mode."""
    parts = [p for p in sku["description"].split(";") if not p.startswith(_NOISE)]
    return {"spec": sku["spec"], "description": ";".join(parts),
            **{mode: price["amount"] for mode, price in sku["prices"].items()},
            **{key: value for key, value in sku["prices"].get("ondemand", {}).items()
               if key in ("usage_factor", "usage_measure_id") and value is not None
               and sku["prices"].get("ondemand", {}).get("usage_factor") not in (None, "Duration")}}


@tool
def search_skus(service: str, region: str, query: str = "", billing: Literal["ondemand", "monthly", "yearly"] | None = None,
                min_vcpus: float | None = None, min_memory_gb: float | None = None, limit: int = 30) -> Any:
    """Search the official price list of a service in a region. Sorted cheapest first.

    `region` accepts a friendly name ('Sao Paulo'). `query` terms must all appear in
    spec/description. Returns spec codes with the list price per billing mode (USD; ondemand per hour, monthly per month, yearly per year).
    """
    return [flat_sku(h) for h in calc.search(service, _region(region), query, billing, min_vcpus, min_memory_gb, limit)]


@tool
def describe_service(service: str, region: str = "sa-brazil-1") -> Any:
    """What a service supports in a region: modes, groups and a sample of specs.

    Use before building a list, so the agent knows the valid options for that region.
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
    if isinstance(amount_usd, bool) or not isinstance(amount_usd, (int, float)) or not math.isfinite(amount_usd):
        raise ValidationError("amount_usd must be finite.", field="amount_usd")
    rates = calc.exchange_rates()
    rate = 1 if currency.upper() == "USD" else rates.get(currency.upper())
    if rate is None:
        raise ValidationError(f"No exchange rate for {currency}.", details={"available": sorted(rates)})
    return {"usd": amount_usd, "currency": currency.upper(), "rate": rate, "amount": round(amount_usd * rate, 2)}


@tool
def compare_modes(items: list[dict[str, Any]], modes: list[str] | None = None, region: str = "sa-brazil-1",
                  currency: str = "USD", hours: float = 730, periods: int = 1) -> Any:
    """Compare the same bill of materials across billing modes.

    `items` are quote items ([{service, spec, quantity, size, usage_*}]).
    Returns the cost per mode and the saving vs on-demand. Modes: ondemand, monthly, yearly.
    """
    modes = modes or ["ondemand", "monthly", "yearly"]
    if any(mode not in ("ondemand", "monthly", "yearly") for mode in modes):
        raise ValidationError("Unknown comparison billing mode.", field="modes")
    if isinstance(periods, bool) or not isinstance(periods, int) or periods < 1:
        raise ValidationError("periods must be a positive integer.", field="periods")
    if isinstance(hours, bool) or not isinstance(hours, (int, float)) or not math.isfinite(hours) or hours <= 0:
        raise ValidationError("hours must be finite and positive.", field="hours")
    reg = _region(region)
    rows = []
    base = None
    for m in modes:
        try:
            q = calc.quote(reg, items, m, hours=hours, periods=periods)  # type: ignore[arg-type]
        except CalculatorError as exc:
            rows.append({"mode": m, "error": exc.message})
            continue
        total = q["total"]
        if m in ("monthly", "yearly"):
            total = total / (periods * (12 if m == "yearly" else 1))
        rows.append({"mode": m, "total_usd": q["total"], "monthly_equivalent_usd": round(total, 2)})
        if m == "ondemand":
            base = total
    for r in rows:
        if base and "monthly_equivalent_usd" in r:
            r["saving_vs_ondemand_pct"] = round((1 - r["monthly_equivalent_usd"] / base) * 100, 1)
    out: dict[str, Any] = {"region": reg, "modes": rows, "hours": hours, "periods": periods}
    if currency.upper() != "USD":
        rate = calc.exchange_rates().get(currency.upper())
        out["currency"] = currency.upper()
        if rate is None:
            raise ValidationError(f"No exchange rate for {currency}.")
        out["rate"] = rate
        for row in rows:
            if "total_usd" in row:
                row["total"] = round(row["total_usd"] * rate, 2)
                row["monthly_equivalent"] = round(row["monthly_equivalent_usd"] * rate, 2)
    return out


@tool
def compare_regions(items: list[dict[str, Any]], regions: list[str], billing: Literal["ondemand", "monthly", "yearly"] = "monthly") -> Any:
    """Price the same bill of materials in several regions. Friendly names accepted."""
    rows = []
    for r in regions:
        try:
            q = calc.quote(_region(r), items, billing)
            rows.append({"region": q["region"], "total_usd": q["total"], "currency": q["currency"]})
        except CalculatorError as exc:
            rows.append({"region": r, "error": exc.code, "message": exc.message, "hint": exc.hint})
    return {"billing": billing, "regions": rows}


# ---- saved lists ------------------------------------------------------------


_ID = re.compile(r"shareListId=([0-9a-fA-F]+)")


def _list_id(value: str) -> str:
    m = _ID.search(value or "")
    return m.group(1) if m else (value or "").strip()


@tool
def read_price_list(url_or_id: str) -> Any:
    """Read any shared price list by url or id (anonymous; works for links others send).

    Returns a normalized summary: one row per item (service, spec, mode, quantity, price).
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
def export_quotes_xlsx(rows: list[dict[str, str]], path: str | None = None) -> Any:
    """Write a workbook of price lists, one row per environment, on four sheets:
    Quotes (environment, list name, total USD, link), Decisions (what was chosen and why),
    Resources (every priced resource) and Totals (instances, vCPUs, RAM, storage).

    rows: [{"env": "prod", "list": share url or id, "draft_id"?: id}], kept in this order. A list saved by
    publish_quote finds its decisions by itself; "draft_id" is for any other. Reads the lists anonymously.
    `path` must end in .xlsx. Existing files are never overwritten. When omitted, a unique
    workbook is created in the user data exports directory. Nothing is written if any list cannot be read.
    """
    from pathlib import Path

    from autocalc import summary, xlsx
    from autocalc.core import DraftStore
    from autocalc.share import SHARE_URL, share_detail
    if path is None:
        import secrets

        from autocalc.auth import data_dir
        path = str(data_dir() / "exports" / f"quotes-{secrets.token_hex(6)}.xlsx")
    if Path(path).exists():
        raise ValidationError("Export path already exists; choose a new filename.", field="path")
    if not path.lower().endswith(".xlsx"):
        raise ValidationError("path must end in .xlsx.", field="path")
    if not rows:
        raise ValidationError("rows is empty.", field="rows")
    store, quotes, decisions, resources, totals = DraftStore(), [], [], [], []
    for r in rows:
        env = r.get("env")
        try:
            lid = _list_id(r["list"])
            detail = share_detail(calc, lid)
            draft_id = r.get("draft_id") or store.draft_for(lid)
            draft = store.load(draft_id) if draft_id else None
        except (CalculatorError, KeyError) as exc:
            raise ValidationError(f"Cannot read the list or draft for {env!r}: {getattr(exc, 'message', exc)}", field="list") from exc
        lines = summary.resources(detail)
        quotes.append([env, detail.get("name") or "", xlsx.Money(summary.total(detail)), xlsx.Link(SHARE_URL.format(id=lid, currency="USD"))])
        if draft:
            by_req = {d.requirement_id: d for d in draft.decisions}
            for q in draft.requirements:
                d = by_req.get(q.id)
                decisions.append([env, q.id, q.service, q.region, q.billing, q.quantity, d.spec if d else "(undecided)",
                                  d.by if d else "", d.justification if d else ""])
        else:
            decisions.append([env, "(no draft is recorded for this list)", None, None, None, None, None, None, None])
        for x in lines:
            resources.append([env, detail.get("name") or "", x["service"], x["region"], x["billing"], x["resource"], x["spec"],
                              x["quantity"], x["storage_gb"] or x["backup_gb"], round(x["vcpus"], 2), round(x["ram_gb"], 2),
                              xlsx.Money(x["price"])])
        t = summary.totals(lines)
        totals.append([env, t["instances"], round(t["vcpus"], 2), round(t["ram_gb"], 2), t["storage_gb"], t["backup_gb"],
                       xlsx.Money(summary.total(detail))])
    n = len(rows) + 1
    grand = round(sum(q[2].value for q in quotes), 2)
    cols = list(zip(*totals, strict=True))
    sums = [xlsx.Sum(2, n, sum(c)) for c in cols[1:6]] + [xlsx.Sum(2, n, grand, money=True)]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    xlsx.write_workbook(Path(path), [
        xlsx.Sheet("Quotes", ["Environment", "Calculator", "Total (USD)", "Link"], quotes, [16, 40, 14, 60],
                   ["Total", None, xlsx.Sum(2, n, grand, money=True), None]),
        xlsx.Sheet("Decisions", ["Environment", "Requirement", "Service", "Region", "Billing", "Quantity", "Chosen spec",
                                 "Decided by", "Justification"], decisions, [16, 16, 12, 16, 12, 10, 28, 12, 70]),
        xlsx.Sheet("Resources", ["Environment", "Calculator", "Service", "Region", "Billing", "Resource", "Spec", "Quantity",
                                 "Storage (GB)", "vCPUs", "RAM (GB)", "Price (USD)"], resources,
                   [16, 30, 12, 16, 12, 16, 30, 10, 14, 10, 10, 14]),
        xlsx.Sheet("Totals", ["Environment", "Instances", "vCPUs", "RAM (GB)", "Storage (GB)", "Backup (GB)", "Total (USD)"],
                   totals, [16, 12, 10, 10, 14, 14, 14], ["Total", *sums],
                   ["Instances, vCPUs and RAM count virtual machines and database instances.",
                    "Storage counts disks, database volumes, message-queue storage and SFS Turbo; Backup counts backup vaults.",
                    "Not counted: bandwidth, containers and usage-billed services (OBS, functions, logs)."]),
    ])
    return {"path": str(Path(path).resolve()), "rows": len(rows), "total_usd": grand}


@tool
def list_my_price_lists() -> Any:
    """List the saved price lists on the user's calculator account (name, id, url, total). Needs a login."""
    from autocalc.share import SHARE_URL, Session
    return [{"name": x.get("name"), "id": x.get("key"), "url": SHARE_URL.format(id=x.get("key"), currency="USD"),
             "total": x.get("totalPrice"), "updated": x.get("updateTime")} for x in Session().lists()]


@tool
def delete_price_list(url_or_id: str) -> Any:
    """Delete a saved price list by url or id. Needs a login. Confirm with the user before calling; this cannot be undone."""
    from autocalc.share import Session
    Session().delete(_list_id(url_or_id))
    return {"deleted": _list_id(url_or_id)}


def _validate_list_name(name: str) -> None:
    if not isinstance(name, str) or not name.strip() or len(name) > 50:
        raise ValidationError("List name must contain 1 to 50 characters.", field="name")


@tool
def rename_price_list(url_or_id: str, new_name: str) -> Any:
    """Rename a saved price list. Needs a login."""
    from autocalc.share import Session, share_detail
    _validate_list_name(new_name)
    lid = _list_id(url_or_id)
    detail = share_detail(calc, lid)
    detail["name"] = new_name
    Session().update(lid, detail)
    return {"id": lid, "name": new_name}


@tool
def duplicate_price_list(url_or_id: str, new_name: str | None = None) -> Any:
    """Copy a saved price list (optionally with a new name). Needs a login."""
    from autocalc.share import SHARE_URL, Session
    if new_name is not None:
        _validate_list_name(new_name)
    s = Session()
    lid = _list_id(url_or_id)
    new_id = s.copy(lid)
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


_login: dict[str, Any] = {}  # the one sign-in running in this process: thread, result


def _run_login() -> None:
    from autocalc import auth
    try:
        res = auth.login(timeout=300)
        _login["result"] = {"logged_in": True, "account_mask": res.account_mask, "browser": res.browser}
    except CalculatorError as exc:
        _login["result"] = exc.as_dict()
    except Exception:
        _login["result"] = CalculatorError("Browser sign-in failed.", hint="Retry auth_login.").as_dict()


@tool
def auth_login(wait_seconds: float = 45) -> Any:
    """Open a browser window so the user can sign in once.

    Waits up to `wait_seconds`. If the user is still signing in, returns `waiting: true` and the
    sign-in carries on for up to 5 minutes: tell the user to finish, then call auth_status.
    Use when a write tool returns AUTH_EXPIRED. Read-only tools (catalog, quote, read_price_list) never need this.
    """
    import threading
    thread = _login.get("thread")
    if thread is None or not thread.is_alive():
        _login.clear()
        _login["thread"] = thread = threading.Thread(target=_run_login, name="autocalc-login")
        thread.start()
    thread.join(wait_seconds)
    if thread.is_alive():
        return {"logged_in": False, "waiting": True, "hint": "Finish signing in in the browser window, then call auth_status."}
    return _login["result"]
