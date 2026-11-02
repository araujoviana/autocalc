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
  autocalc validate LIST_ID
  Additional JSON tool commands are listed by --help.
  autocalc page-controls SERVICE
"""

from __future__ import annotations

import argparse
import inspect
import json
import re
import sys
import types
import typing
from importlib import metadata
from pathlib import Path

from autocalc import frontend, ui
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
    """Accept an id or a city/country alias and return the canonical region id."""
    if not value:
        return value
    resolver = RegionResolver.from_menu(calc.menu())
    return resolver.resolve(value)


def _print_err(exc: CalculatorError) -> int:
    print(f"{ui.paint('error', 'red', sys.stderr)}[{exc.code}]: {exc.message}", file=sys.stderr)
    if exc.hint:
        print(f"  {ui.paint('->', 'dim', sys.stderr)} {exc.hint}", file=sys.stderr)
    return 2


def _json_arg(value: str):
    """A JSON value, or @path to read it from a file."""
    try:
        return json.loads(Path(value[1:]).read_text(encoding="utf-8") if value.startswith("@") else value)
    except (OSError, ValueError) as exc:
        raise argparse.ArgumentTypeError(f"not valid JSON (or readable @file): {exc}") from exc


# JSON twins of services / regions / search: still work, but --help lists the friendlier command
JSON_TWINS = {"list-services", "list-regions", "search-skus"}


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
            if typing.get_origin(t) in (typing.Union, types.UnionType):
                scalar = [value for value in typing.get_args(t) if value is not type(None)]
                if len(scalar) == 1:
                    t = scalar[0]
            opt = "--" + par.name.replace("_", "-")
            if t is bool:
                p.add_argument(opt, dest=par.name, action=argparse.BooleanOptionalAction, default=False if req else par.default)
            elif t in (int, float, str):
                p.add_argument(opt, dest=par.name, type=t, required=req, default=None if req else par.default)
            else:
                p.add_argument(opt, dest=par.name, type=_json_arg, required=req, metavar="JSON|@FILE",
                               default=None if req else par.default)
        out[cmd] = (fn, [q.name for q in inspect.signature(fn).parameters.values()])
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="autocalc", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", action="version", version=f"autocalc {metadata.version('autocalc')}")
    sub = ap.add_subparsers(dest="cmd", required=True, metavar="command", title="commands")
    p = sub.add_parser("services", help="find a service by name or category")
    p.add_argument("query", nargs="?", default="")
    p = sub.add_parser("regions", help="list regions, or where one service is sold")
    p.add_argument("service", nargs="?", default="")
    p = sub.add_parser("search", help="search a service's price list in one region")
    p.add_argument("service")
    p.add_argument("region")
    p.add_argument("terms", nargs="*")
    p.add_argument("--billing", choices=["ondemand", "monthly", "yearly"])
    p.add_argument("--vcpus", type=float)
    p.add_argument("--mem", type=float)
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--refresh", action="store_true")
    p = sub.add_parser("quote", help="price a bill of materials")
    p.add_argument("region")
    p.add_argument("items", nargs="+", type=parse_item)
    p.add_argument("--billing", choices=["ondemand", "monthly", "yearly"], default="ondemand")
    p.add_argument("--hours", type=float, default=730)
    p.add_argument("--periods", type=int, default=1)
    p.add_argument("--currency")
    p = sub.add_parser("login", help="sign in once in a browser window")
    p.add_argument("--profile")
    p.add_argument("--timeout", type=float, default=300)
    p = sub.add_parser("logout", help="sign out (deletes the browser profile)")
    p.add_argument("--profile")
    p = sub.add_parser("auth", help="show whether you are signed in")
    p.add_argument("action", choices=["status"])
    p.add_argument("--profile")
    sub.add_parser("lists", help="your saved price lists")
    p = sub.add_parser("validate", help="re-read a saved list and look for glitches")
    p.add_argument("list_id")
    sub.add_parser("doctor", help="check endpoints, sign-in, browser and cache")
    sub.add_parser("install-browser", help="download a browser if none is installed")
    p = sub.add_parser("update", help="move to the newest release")
    p.add_argument("--to", help="a release tag, vX.Y.Z (default: the newest)")
    p = sub.add_parser("page-controls", help="list the controls of a service's calculator page")
    p.add_argument("service")
    p = sub.add_parser("schema", help="the generated card schema: pull | coverage | diff")
    p.add_argument("action", choices=["pull", "coverage", "diff"])
    p.add_argument("service")
    p.add_argument("--json", action="store_true", help="print JSON even on a terminal")
    tool_cmds = _add_tool_commands(sub, set(sub.choices))
    a = ap.parse_args(argv)

    try:
        if a.cmd in tool_cmds:
            fn, names = tool_cmds[a.cmd]
            from autocalc.update import with_notice
            result = with_notice(fn(**{n: getattr(a, n) for n in names}))
            human = _quote_view(a.cmd, result) if ui.fancy() else None
            print(human or json.dumps(result, indent=2, ensure_ascii=False, default=str))
            return 0
        if a.cmd == "login":
            from autocalc import auth
            print("Opening a browser window. Sign in to Huawei Cloud; this window closes when done.")
            res = auth.login(a.profile, timeout=a.timeout)
            print(ui.status("ok", f"Logged in as {res.account_mask or 'your account'} (browser: {res.browser})"))
            return 0
        if a.cmd == "logout":
            from autocalc import auth
            removed = auth.logout(a.profile)
            print(ui.status("ok", "Signed out. Deleted: " + ", ".join(removed)) if removed
                  else ui.status("warn", "Already signed out; nothing to delete."))
            return 0
        if a.cmd == "auth":
            from autocalc import auth
            st = auth.status(a.profile)
            if not ui.fancy():
                print(json.dumps(st, indent=2))
            elif st["logged_in"]:
                print(ui.status("ok", f"Signed in as {st.get('account_mask') or 'your account'}"))
                print(ui.table([("profile", st["profile"]), ("browser", st["browser"]), ("cookies", st["cookies"])]))
            else:
                print(ui.status("warn", "Not signed in") + f"  -> {st.get('hint', auth.LOGIN_HINT)}")
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
        if a.cmd == "schema":
            return _schema(a.action, a.service, a.json)
        if a.cmd == "lists":
            from autocalc.share import Session
            rows = [(x.get("key"), x.get("name", "")[:40],
                     x.get("totalPrice", {}).get("amount") if isinstance(x.get("totalPrice"), dict) else x.get("totalPrice"))
                    for x in Session().lists()]
            if not ui.fancy():
                for key, name, total in rows:
                    print(f"{key}  {name:<40} {total}")
            else:
                print(ui.table(rows, ("KEY", "NAME", "TOTAL")) if rows else "No saved lists.")
                if rows:
                    print(ui.paint(f"{len(rows)} saved list{'s' * (len(rows) != 1)}", "dim"))
            return 0

        c = Calculator()
        if a.cmd == "validate":
            from autocalc.share import share_detail
            from autocalc.validate import validate_list
            print(json.dumps(validate_list(share_detail(c, a.list_id)), indent=2))
            return 0
        if a.cmd == "services":
            found = [s for s in c.services() if a.query.lower() in f"{s['service']} {s['name']} {s['category']}".lower()]
            if not ui.fancy():
                for s in found:
                    print(f"{s['service']:<16} {s['name']}  [{s['category']}]")
            else:
                print(ui.table([(s["service"], s["name"], s["category"]) for s in found], ("SERVICE", "NAME", "CATEGORY")))
                print(ui.paint(f"{len(found)} service{'s' * (len(found) != 1)}", "dim"))
        elif a.cmd == "regions":
            regions = c.regions()
            if a.service:
                allowed = next((s["regions"] for s in c.services() if s["service"] == a.service), [])
                regions = {r: regions.get(r, r) for r in allowed}
            if not ui.fancy():
                for r, n in regions.items():
                    print(f"{r:<20} {n}")
            else:
                print(ui.table(list(regions.items()), ("REGION", "NAME")))
                print(ui.paint(f"{len(regions)} region{'s' * (len(regions) != 1)}", "dim"))
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


def _schema(action: str, service: str, as_json: bool = False) -> int:
    from autocalc.schema import generate
    human = ui.fancy() and not as_json
    committed = generate.load_service(service) if service.isalnum() else None
    if action != "pull" and committed is None:
        msg = f"No committed schema for {service}; run `autocalc schema pull {service}`."
        print(ui.status("fail", msg) if human else msg)
        return 1
    if action == "coverage":
        c = generate.coverage(committed)
        if not human:
            print(json.dumps(c, indent=2))
        else:
            print("\n".join([ui.status(k, i) for k, key in (("ok", "mapped"), ("warn", "unmapped")) for i in c[key]]
                             + [ui.paint(f"- {i} (unsupported)", "dim") for i in c["unsupported"]]))
            print(ui.paint(f"Coverage {len(c['mapped'])}/{len(c['mapped']) + len(c['unmapped'])} mapped "
                           f"({c['mapped_percent']}%), {len(c['unsupported'])} unsupported", "bold"))
    elif action == "diff":
        d = generate.diff(committed, generate.pull(service))
        if not human:
            print(json.dumps(d, indent=2))
        else:
            for key, kind in (("added", "warn"), ("removed", "fail"), ("changed", "warn")):
                for i in d[key]:
                    print(ui.status(kind, f"{key}: {i}"))
            drift = any(d.values())
            print(ui.status("warn" if drift else "ok", f"{service}: " + (
                f"{len(d['added'])} added, {len(d['removed'])} removed, {len(d['changed'])} changed"
                f"  -> autocalc schema pull {service}" if drift else "no drift from the live page")))
        return 1 if any(d.values()) else 0
    else:
        (generate.FILES / f"{service}.yaml").write_text(generate.dump(generate.pull(service)), encoding="utf-8")
        print(ui.status("ok", f"Wrote schema for {service}.") if human else f"Wrote schema for {service}.")
    return 0


def _quote_view(cmd: str, result: dict) -> str | None:
    """A terminal summary of plan-quote / apply-quote; None for every other tool (they print JSON)."""
    if cmd == "plan-quote" and "cards" in result:
        rows = []
        for c in result["cards"]:
            notes = []
            if c.get("unmapped_options"):
                notes.append("unmapped: " + ", ".join(c["unmapped_options"]))
            if c.get("lock_drift"):
                notes.append(f"price moved from {c['lock_drift']['locked_price']}")
            if "candidates" in c:
                notes.append(f"{len(c['candidates'])} candidates: choose a spec")
            rows.append((c["id"], c.get("spec", "-"), c.get("price") or "-", "; ".join(notes)))
        problems = sum(1 for c in result["cards"] if "spec" not in c or c.get("unmapped_options") or c.get("lock_drift"))
        out = ui.table(rows, ("CARD", "SPEC", "PRICE", "NOTES"))
        return out + "\n" + (ui.status("warn", f"{problems} of {len(rows)} cards need attention before apply")
                             if problems else ui.status("ok", f"{len(rows)} cards resolved; ready to apply"))
    if cmd == "apply-quote" and result.get("url"):
        checks = result.get("checks") or []
        return ui.status("ok", f"Published {result.get('name', '')}  {len(checks)} cards verified") + f"\n  {result['url']}"
    return None


def _doctor() -> int:
    import httpx

    from autocalc import auth
    from autocalc.client import CALC, EXCHANGE, INQUIRY

    print(ui.paint("autocalc doctor", "bold") + "\n" + "-" * 40)
    ok = True
    warns = 0

    def line(kind: str, text: str) -> None:
        nonlocal warns
        warns += kind == "warn"
        print(ui.status(kind, text))
    checks = {"menuInfo": ("GET", f"{CALC}/menuInfo", {"sign": "common", "language": "en-us"}, None),
              "inquiry": ("POST", INQUIRY, None, {"siteCode": "HWC", "productInfos": []}),
              "exchange-rate": ("GET", EXCHANGE, {"page_no": 1, "page_size": 5}, None)}
    for name, (method, url, params, body) in checks.items():
        try:
            r = httpx.request(method, url, params=params, json=body, timeout=15,
                              headers={"Origin": "https://www.huaweicloud.com"})
            good = r.status_code == 200
            ok = ok and good
            line("ok" if good else "fail", f"{name}: HTTP {r.status_code}")
        except Exception as exc:  # noqa: BLE001
            ok = False
            line("fail", f"{name}: {exc}  -> check network / proxy")
    calc = None
    try:
        calc = Calculator()
        live = frontend.live_version()
        ok = ok and bool(live)
        line("ok" if live else "fail", f"frontend version: {live or 'unknown'}")
        for note in frontend.warnings(sorted(VERIFIED), live):
            line("warn", note)
        from autocalc.schema import generate
        for note in generate.stale_notes(live):
            line("warn", note)
    except Exception as exc:  # noqa: BLE001
        ok = False
        line("fail", f"frontend version: {exc}")
    browser = auth.find_browser()
    bundled = browser.name == "bundled"
    line("warn" if bundled else "ok", f"browser: {browser.describe()}"
         + ("  -> install Chrome or Edge, or run `autocalc install-browser`" if bundled else ""))
    udd = auth.profile_dir()
    line("ok", f"profile: {udd}") if udd.exists() else line("warn", f"profile: none yet  -> {auth.LOGIN_HINT}")
    try:
        auth.data_dir().mkdir(parents=True, exist_ok=True)
        if calc is None:
            calc = Calculator()
        line("ok", f"cache/config: {calc.cache_dir}")
    except Exception as exc:  # noqa: BLE001
        ok = False
        line("fail", f"cache dir: {exc}")
    if ui.fancy():
        print("-" * 40 + "\n" + (ui.status("ok", "All checks passed" + (f" ({warns} warning{'s' * (warns != 1)})" if warns else ""))
                                 if ok else ui.status("fail", "Some checks failed; see above")))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
