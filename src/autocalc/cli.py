"""Command-line Huawei Cloud price calculator.

  autocalc services [query]
  autocalc regions [service]
  autocalc search SERVICE REGION [terms...] [--billing ondemand|monthly|yearly] [--vcpus N] [--mem GB]
  autocalc quote REGION SERVICE:SPEC[*QTY][@SIZE] ... [--billing ...] [--hours 730] [--periods 1] [--currency BRL]
  autocalc login [--profile NAME] [--timeout SECONDS]
  autocalc logout [--profile NAME]
  autocalc auth status [--profile NAME]
  autocalc lists
  autocalc doctor
  autocalc install-browser
  autocalc update [--to vX.Y.Z]
  autocalc page-controls SERVICE
"""

from __future__ import annotations

import argparse
import inspect
import json
import re
import sys
import typing

from autocalc import frontend
from autocalc.client import Calculator
from autocalc.errors import CalculatorError
from autocalc.regions import RegionResolver
from autocalc.services import VERIFIED

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


def _json_arg(value: str):
    """A JSON value, or @path to read it from a file."""
    try:
        return json.loads(open(value[1:], encoding="utf-8").read() if value.startswith("@") else value)
    except (OSError, ValueError) as exc:
        raise argparse.ArgumentTypeError(f"not valid JSON (or readable @file): {exc}") from exc


def _add_tool_commands(sub, taken: set[str]) -> dict[str, tuple]:
    """One subcommand per registry tool; scalars become options, anything else takes JSON."""
    from autocalc import workflow  # noqa: F401  (registers the workflow tools)
    from autocalc.tools import REGISTRY

    out = {}
    for name, fn in REGISTRY.items():
        cmd = name.replace("_", "-")
        if cmd in taken:
            continue
        p = sub.add_parser(cmd, help=(fn.__doc__ or "").strip().split("\n")[0])
        hints = typing.get_type_hints(fn)
        for par in inspect.signature(fn).parameters.values():
            t, req = hints.get(par.name, str), par.default is inspect.Parameter.empty
            opt = "--" + par.name.replace("_", "-")
            if t is bool:
                p.add_argument(opt, dest=par.name, action="store_true")
            elif t in (int, float, str):
                p.add_argument(opt, dest=par.name, type=t, required=req, default=None if req else par.default)
            else:
                p.add_argument(opt, dest=par.name, type=_json_arg, required=req, metavar="JSON|@FILE",
                               default=None if req else par.default)
        out[cmd] = (fn, [q.name for q in inspect.signature(fn).parameters.values()])
    return out


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
    p = sub.add_parser("logout")
    p.add_argument("--profile")
    p = sub.add_parser("auth")
    p.add_argument("action", choices=["status"])
    p.add_argument("--profile")
    sub.add_parser("lists")
    p = sub.add_parser("validate")
    p.add_argument("list_id")
    sub.add_parser("doctor")
    sub.add_parser("install-browser")
    p = sub.add_parser("update")
    p.add_argument("--to", help="a release tag, vX.Y.Z (default: the newest)")
    p = sub.add_parser("page-controls", help="list the controls of a service's calculator page")
    p.add_argument("service")
    tool_cmds = _add_tool_commands(sub, set(sub.choices))
    a = ap.parse_args(argv)

    try:
        if a.cmd in tool_cmds:
            fn, names = tool_cmds[a.cmd]
            from autocalc.update import with_notice
            print(json.dumps(with_notice(fn(**{n: getattr(a, n) for n in names})), indent=2, ensure_ascii=False, default=str))
            return 0
        if a.cmd == "login":
            from autocalc import auth
            print("Opening a browser window. Sign in to Huawei Cloud; this window closes when done.")
            res = auth.login(a.profile, timeout=a.timeout)
            print(f"Logged in as {res.account_mask or 'your account'} \u2713 (browser: {res.browser})")
            return 0
        if a.cmd == "logout":
            from autocalc import auth
            removed = auth.logout(a.profile)
            print("Signed out. Deleted: " + ", ".join(removed) if removed else "Already signed out; nothing to delete.")
            return 0
        if a.cmd == "auth":
            from autocalc import auth
            print(json.dumps(auth.status(a.profile), indent=2))
            return 0
        if a.cmd == "doctor":
            return _doctor()
        if a.cmd == "install-browser":
            import subprocess
            return subprocess.call([sys.executable, "-m", "playwright", "install", "chromium"])
        if a.cmd == "update":
            from autocalc import update
            print(update.update(a.to))
            return 0
        if a.cmd == "page-controls":
            from autocalc.page.controls import page_controls
            print(json.dumps(page_controls(a.service), indent=2))
            return 0
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
        live = frontend.live_version()
        print(f"[ok]   frontend version: {live or 'unknown'}")
        for note in frontend.warnings(sorted(VERIFIED), live):
            print(f"[warn] {note}")
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] frontend version: {exc}")
    browser = auth.find_browser()
    print(f"[{'warn' if browser.name == 'bundled' else 'ok'}]   browser: {browser.describe()}"
          + ("  -> install Chrome or Edge, or run `autocalc install-browser`" if browser.name == "bundled" else ""))
    udd = auth.profile_dir()
    print(f"[ok]   profile: {udd}" if udd.exists() else f"[warn] profile: none yet  -> {auth.LOGIN_HINT}")
    try:
        auth.data_dir().mkdir(parents=True, exist_ok=True)
        print(f"[ok]   cache/config: {Calculator().cache_dir}")
    except Exception as exc:  # noqa: BLE001
        ok = False
        print(f"[FAIL] cache dir: {exc}")
    return 0 if ok else 1


if __name__ == "__main__":
    main()
