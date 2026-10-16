"""Command-line Huawei Cloud price calculator.

  autocalc services [query]
  autocalc regions [service]
  autocalc search SERVICE REGION [terms...] [--billing ondemand|monthly|yearly] [--vcpus N] [--mem GB]
  autocalc quote REGION SERVICE:SPEC[*QTY][@SIZE] ... [--billing ...] [--hours 730] [--periods 1] [--currency BRL]
  autocalc login [--profile NAME] [--timeout SECONDS]
  autocalc logout
  autocalc auth status | auth import [FILE|-]
  autocalc lists
  autocalc doctor
  autocalc install-browser
"""

from __future__ import annotations

import argparse
import json
import re
import sys

from autocalc.client import Calculator
from autocalc.errors import CalculatorError
from autocalc.regions import RegionResolver

_ITEM = re.compile(r"^(?P<service>[^:]+):(?P<spec>[^*@]+?)(?:\*(?P<qty>\d+))?(?:@(?P<size>[\d.]+))?$")


def parse_item(s: str) -> dict:
    m = _ITEM.match(s)
    if not m:
        raise argparse.ArgumentTypeError(f"bad item {s!r}; expected service:spec[*QTY][@SIZE]")
    item = {"service": m["service"], "spec": m["spec"], "quantity": int(m["qty"] or 1)}
    if m["size"]:
        item["size"] = float(m["size"])
    return item


def _friendly_region(calc: Calculator, value: str) -> str:
    """Accept an id or a city/country alias and return the canonical region id (E1)."""
    if not value:
        return value
    resolver = RegionResolver.from_menu(calc.menu())
    return resolver.resolve(value)


def _print_err(exc: CalculatorError) -> int:
    print(f"error[{exc.code}]: {exc.message}", file=sys.stderr)
    if exc.hint:
        print(f"  -> {exc.hint}", file=sys.stderr)
    return 2


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="autocalc", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("services")
    p.add_argument("query", nargs="?", default="")
    p = sub.add_parser("regions")
    p.add_argument("service", nargs="?", default="")
    p = sub.add_parser("search")
    p.add_argument("service")
    p.add_argument("region")
    p.add_argument("terms", nargs="*")
    p.add_argument("--billing", choices=["ondemand", "monthly", "yearly"])
    p.add_argument("--vcpus", type=float)
    p.add_argument("--mem", type=float)
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--refresh", action="store_true")
    p = sub.add_parser("quote")
    p.add_argument("region")
    p.add_argument("items", nargs="+", type=parse_item)
    p.add_argument("--billing", choices=["ondemand", "monthly", "yearly"], default="ondemand")
    p.add_argument("--hours", type=float, default=730)
    p.add_argument("--periods", type=int, default=1)
    p.add_argument("--currency")
    p = sub.add_parser("login")
    p.add_argument("--profile")
    p.add_argument("--timeout", type=float, default=300)
    sub.add_parser("logout")
    p = sub.add_parser("auth")
    p.add_argument("action", choices=["status", "import"])
    p.add_argument("file", nargs="?")
    sub.add_parser("lists")
    p = sub.add_parser("validate")
    p.add_argument("list_id")
    sub.add_parser("doctor")
    sub.add_parser("install-browser")
    a = ap.parse_args(argv)

    try:
        if a.cmd == "login":
            from autocalc import auth
            print("Opening a browser window. Sign in to Huawei Cloud; this window closes when done.")
            sess = auth.login(a.profile, timeout=a.timeout)
            where = auth.SessionStore(a.profile).save(sess)
            who = sess.account_mask or "your account"
            print(f"Logged in as {who} \u2713  (stored in {where})")
            return 0
        if a.cmd == "logout":
            from autocalc import auth
            auth.SessionStore().clear()
            print("Session cleared.")
            return 0
        if a.cmd == "auth":
            from autocalc import auth
            if a.action == "status":
                print(json.dumps(auth.status(), indent=2))
            else:
                text = sys.stdin.read() if a.file in (None, "-") else open(a.file).read()
                if a.file is None:
                    text = auth.import_from_clipboard()
                header = auth.parse_curl(text)
                auth.SessionStore().save(auth.Session(cookie_header=header, source="import"))
                print(f"Imported session: {auth.redact_cookie_header(header)}")
            return 0
        if a.cmd == "doctor":
            return _doctor()
        if a.cmd == "install-browser":
            import subprocess
            return subprocess.call([sys.executable, "-m", "playwright", "install", "chromium"])
        if a.cmd == "lists":
            from autocalc.share import Session
            for x in Session().lists():
                print(f"{x.get('key')}  {x.get('name','')[:40]:<40} {x.get('totalPrice',{}).get('amount') if isinstance(x.get('totalPrice'),dict) else x.get('totalPrice')}")
            return 0

        c = Calculator()
        if a.cmd == "validate":
            from autocalc.share import share_detail
            from autocalc.validate import validate_list
            print(json.dumps(validate_list(share_detail(c, a.list_id)), indent=2))
            return 0
        if a.cmd == "services":
            for s in c.services():
                if a.query.lower() in f"{s['service']} {s['name']} {s['category']}".lower():
                    print(f"{s['service']:<16} {s['name']}  [{s['category']}]")
        elif a.cmd == "regions":
            regions = c.regions()
            if a.service:
                allowed = next((s["regions"] for s in c.services() if s["service"] == a.service), [])
                regions = {r: regions.get(r, r) for r in allowed}
            for r, n in regions.items():
                print(f"{r:<20} {n}")
        elif a.cmd == "search":
            region = _friendly_region(c, a.region)
            for h in c.search(a.service, region, " ".join(a.terms), a.billing, a.vcpus, a.mem, a.limit):
                prices = "  ".join(f"{m}=${p['amount']}/{p['per']}" for m, p in h["prices"].items())
                print(f"{h['spec']:<32} {prices}\n    {h['description'][:150]}")
        elif a.cmd == "quote":
            region = _friendly_region(c, a.region)
            q = c.quote(region, a.items, a.billing, a.hours, a.periods)
            if a.currency:
                rate = c.exchange_rates().get(a.currency.upper())
                q["converted"] = {"currency": a.currency.upper(), "rate": rate, "total": round(q["total"] * rate, 2) if rate else None}
            print(json.dumps(q, indent=2, ensure_ascii=False))
    except CalculatorError as exc:
        raise SystemExit(_print_err(exc)) from exc
    return 0


def _doctor() -> int:
    import httpx

    from autocalc import auth
    from autocalc.client import CALC, EXCHANGE, INQUIRY

    print("autocalc doctor\n" + "-" * 40)
    ok = True
    checks = {"menuInfo": ("GET", f"{CALC}/menuInfo", {"sign": "common", "language": "en-us"}, None),
              "inquiry": ("POST", INQUIRY, None, {"regionId": "sa-brazil-1", "chargingMode": 0, "periodType": 2, "periodNum": 1,
                                                   "subscriptionNum": 1, "siteCode": "HWC", "productInfos": [
                                                       {"id": "a", "cloudServiceType": "hws.service.type.ec2",
                                                        "resourceType": "hws.resource.type.vm",
                                                        "resourceSpecCode": "c7n.large.2.linux", "productNum": 1}]}),
              "exchange-rate": ("GET", EXCHANGE, {"page_no": 1, "page_size": 5}, None)}
    for name, (method, url, params, body) in checks.items():
        try:
            r = httpx.request(method, url, params=params, json=body, timeout=15,
                              headers={"Origin": "https://www.huaweicloud.com"})
            good = r.status_code == 200
            ok = ok and good
            print(f"[{'ok' if good else 'FAIL'}]   {name}: HTTP {r.status_code}")
        except Exception as exc:  # noqa: BLE001
            ok = False
            print(f"[FAIL] {name}: {exc}  -> check network / proxy")
    try:
        Calculator()
        html = httpx.get("https://www.huaweicloud.com/intl/en-us/pricing/calculator.html", timeout=20).text
        m = re.search(r"CBC-PortalCalculator/([0-9.]+)", html)
        print(f"[ok]   frontend version: {m.group(1) if m else 'unknown'}")
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] frontend version: {exc}")
    st = auth.status()
    print(f"[{'ok' if st['logged_in'] else 'warn'}]   auth: " + (f"logged in ({st.get('account_mask') or 'account'})" if st["logged_in"] else st["hint"]))
    try:
        auth.data_dir().mkdir(parents=True, exist_ok=True)
        print(f"[ok]   cache/config: {Calculator().cache_dir}")
    except Exception as exc:  # noqa: BLE001
        ok = False
        print(f"[FAIL] cache dir: {exc}")
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            path = p.chromium.executable_path
        print(f"[{'ok' if path else 'warn'}]   playwright chromium: {path or 'run autocalc install-browser'}")
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] playwright: {exc}  -> run `autocalc install-browser`")
    return 0 if ok else 1


if __name__ == "__main__":
    main()
