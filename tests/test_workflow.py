"""draft → revise → publish, and the registry that feeds MCP and the CLI."""

import json
from decimal import Decimal

import pytest

from autocalc import cli, server, tools, workflow
from autocalc.core import Candidate, DraftStore
from autocalc.errors import AuthExpired, GateFailed, PageEncodeFailed, ValidationError


class FakeProvider:
    name = "fake"

    def candidates(self, req):
        return [Candidate("c7n.large.2", req.region, req.billing, Decimal("10"), {"vcpus": 2, "memory_gb": 4}),
                Candidate("c7n.xlarge.2", req.region, req.billing, Decimal("20"), {"vcpus": 4, "memory_gb": 8})]


class FakeSession:
    signed_in = True

    def lists(self):
        if not FakeSession.signed_in:
            raise AuthExpired("Not logged in.")
        return []


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOCALC_DATA", str(tmp_path))
    monkeypatch.setattr(workflow, "HuaweiProvider", lambda calc: FakeProvider())
    monkeypatch.setattr(tools, "_region", lambda v: v)
    monkeypatch.setattr(workflow, "Session", FakeSession)
    return DraftStore()


class FakeBuilder:
    spec_arg = "flavor"

    def __init__(self, svc, seen):
        self.svc, self.seen = svc, seen

    def spec_option(self, spec):
        return spec

    def build(self, **kw):
        self.seen.update(svc=self.svc, **kw)
        return {"rewriteValue": {"form": 1}}


def req(**kw):
    return {"id": "r1", "service": "ecs", "region": "sa-brazil-1", "billing": "monthly", "needs": {"vcpus": 3}, **kw}


def test_undecided_draft_cannot_publish_and_decided_one_reaches_the_gate(store, monkeypatch):
    # needs 3 vCPU: only the 4 vCPU flavor covers it, which is not an exact match, so it stays pending
    d = workflow.draft_quote("acme", [req(options={"image": "AlmaLinux"})])
    assert d["pending"] == ["r1"] and d["requirements"][0]["candidates"][0]["spec"] == "c7n.xlarge.2"
    with pytest.raises(ValidationError) as ei:
        workflow.publish_quote(d["draft_id"], "n")
    assert ei.value.details["allowed"] == ["r1"]

    assert workflow.revise_quote(d["draft_id"], [{"requirement_id": "r1", "spec": "c7n.xlarge.2",
                                                  "justification": "customer wants headroom"}])["pending"] == []
    built, gate = {}, {}
    monkeypatch.setattr(workflow, "get_builder", lambda svc, calc=None: FakeBuilder(svc, built))
    monkeypatch.setattr(workflow, "encode_card", lambda svc, rv: {"page_card_for": svc, "form": rv, "selectedProduct": {}})

    def fake_publish(name, cards, **kw):
        gate["cards"] = cards
        raise GateFailed("no", cards=[])

    monkeypatch.setattr(workflow, "publish_checked", fake_publish)
    with pytest.raises(GateFailed):
        workflow.publish_quote(d["draft_id"], "n")
    assert (built["svc"], built["flavor"], built["image"], built["quantity"]) == ("ecs", "c7n.xlarge.2", "AlmaLinux", 1)
    # the page's card, not the builder's, titled with the requirement's name
    assert gate["cards"] == [{"page_card_for": "ecs", "form": {"form": 1}, "selectedProduct": {"_customTitle": "r1"}}]


def test_published_result_warns_when_the_frontend_changed(store, monkeypatch):
    d = workflow.draft_quote("acme", [req(needs={"vcpus": 2})])
    monkeypatch.setattr(workflow, "get_builder", lambda svc, calc=None: FakeBuilder(svc, {}))
    monkeypatch.setattr(workflow, "encode_card", lambda svc, rv: {"selectedProduct": {}})
    monkeypatch.setattr(workflow, "publish_checked", lambda *a, **k: {"id": "L1", "url": "u", "checks": []})
    monkeypatch.setattr(workflow.frontend, "live_version", lambda: "99.0.0")
    out = workflow.publish_quote(d["draft_id"], "n")
    assert out["id"] == "L1" and "99.0.0" in out["warnings"][0]


def test_a_card_the_page_cannot_encode_saves_nothing(store, monkeypatch):
    d = workflow.draft_quote("acme", [req(needs={"vcpus": 2})])
    assert d["pending"] == []
    monkeypatch.setattr(workflow, "get_builder", lambda svc, calc=None: FakeBuilder(svc, {}))

    def cannot(svc, rv):
        raise PageEncodeFailed("no", service=svc, field="calculator_ecs_radio_cpu")

    monkeypatch.setattr(workflow, "encode_card", cannot)
    monkeypatch.setattr(workflow, "publish_checked", lambda *a, **k: pytest.fail("reached the gate"))
    with pytest.raises(PageEncodeFailed):
        workflow.publish_quote(d["draft_id"], "n")


def test_unsupported_service_fails_before_any_build(store):
    d = workflow.draft_quote("acme", [req(service="cbh", needs={"vcpus": 1000})])
    workflow_store = DraftStore()
    from autocalc.core import decide
    decide(workflow_store, d["draft_id"], "r1", "c7n.large.2", "test")
    with pytest.raises(ValidationError, match="cbh"):
        workflow.publish_quote(d["draft_id"], "n")


def test_mcp_and_cli_expose_the_same_registry(capsys):
    mcp_names = {t.name for t in server.mcp._tool_manager.list_tools()}
    assert mcp_names == set(tools.REGISTRY) and "create_price_list" not in mcp_names
    sub = cli.argparse.ArgumentParser().add_subparsers()
    cmds = cli._add_tool_commands(sub, {"quote"})
    assert set(cmds) == {n.replace("_", "-") for n in tools.REGISTRY} - {"quote"}


def test_cli_runs_a_tool_with_json_arguments(store, tmp_path, capsys):
    f = tmp_path / "r.json"
    f.write_text(json.dumps([req()]))
    assert cli.main(["draft-quote", "--customer", "acme", "--requirements", f"@{f}"]) == 0
    assert json.loads(capsys.readouterr().out)["pending"] == ["r1"]


def test_recipe_service_warns_that_the_chosen_spec_is_not_applied(store, monkeypatch):
    d = workflow.draft_quote("acme", [req(service="er", needs={"vcpus": 1000})])
    from autocalc.core import decide
    decide(DraftStore(), d["draft_id"], "r1", "c7n.large.2", "test")

    class Recipe(FakeBuilder):
        spec_arg = None

    monkeypatch.setattr(workflow, "get_builder", lambda svc, calc=None: Recipe(svc, {}))
    monkeypatch.setattr(workflow, "encode_card", lambda svc, rv: {"selectedProduct": {}})
    monkeypatch.setattr(workflow, "publish_checked", lambda *a, **k: {"id": "L1", "url": "u", "checks": []})
    monkeypatch.setattr(workflow.frontend, "live_version", lambda: None)
    out = workflow.publish_quote(d["draft_id"], "n")
    assert any("c7n.large.2" in w and "not applied" in w for w in out["warnings"])


def test_mcp_tools_run_off_the_event_loop():
    import asyncio

    from autocalc import server

    def blocking():
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return {"loop": False}  # Playwright's sync API needs exactly this
        return {"loop": True}

    wrapped = server._tool_errors(blocking)
    assert asyncio.run(wrapped()) == {"loop": False}


def test_publish_checks_the_session_before_encoding_anything(store, monkeypatch):
    d = workflow.draft_quote("acme", [req(needs={"vcpus": 4})])
    monkeypatch.setattr(workflow, "encode_card", lambda *a, **k: pytest.fail("encoded before the login check"))
    monkeypatch.setattr(FakeSession, "signed_in", False)
    with pytest.raises(AuthExpired):
        workflow.publish_quote(d["draft_id"], "n")


def test_draft_rejects_an_option_the_service_does_not_take(store):
    with pytest.raises(ValidationError) as ei:
        workflow.draft_quote("acme", [{"id": "r1", "service": "ecs", "region": "sa-brazil-1", "billing": "monthly",
                                       "needs": {"vcpus": 2}, "options": {"sytem_disk": ("GPSSD", 40)}}])
    assert ei.value.details["field"] == "sytem_disk" and "system_disk" in ei.value.details["allowed"]


def test_supported_services_lists_options():
    from autocalc.services import supported_services
    rows = {r["service"]: r for r in supported_services()}
    assert "system_disk" in rows["ecs"]["options"] and "hours" not in rows["ecs"]["options"]
    assert rows["ecs"]["options"] and all(isinstance(r["options"], list) for r in rows.values())


def test_auth_login_returns_waiting_then_the_result_through_the_same_sign_in(monkeypatch):
    import threading
    from types import SimpleNamespace

    from autocalc import auth
    done, opened = threading.Event(), []

    def slow_login(timeout):
        opened.append(timeout)
        done.wait(5)
        return SimpleNamespace(account_mask="a***", browser="chromium")

    monkeypatch.setattr(auth, "login", slow_login)
    tools._login.clear()
    assert tools.auth_login(wait_seconds=0.05)["waiting"] is True
    assert tools.auth_login(wait_seconds=0.05)["waiting"] is True  # joins, no second browser
    done.set()
    assert tools.auth_login(wait_seconds=2) == {"logged_in": True, "account_mask": "a***", "browser": "chromium"}
    assert len(opened) == 1


def test_list_regions_only_lists():
    import inspect
    assert list(inspect.signature(tools.list_regions).parameters) == ["service"]


def _detail(name, total):
    """A list with 3 servers (4 vCPUs, 8 GB, a 40 GB disk each) and a usage line that carries no price."""
    vm = {"resourceType": "hws.resource.type.vm", "resourceSpecCode": "c7n.xlarge.2.linux", "productNum": 3,
          "productSpecSysDesc": "Memory:8192MB;vCPUs:4CORE;Series:C7n", "inquiryResult": {"amount": 300.0}}
    disk = {"resourceType": "hws.resource.type.volume", "resourceSpecCode": "GPSSD", "productNum": 3, "resourceSize": 40,
            "resouceSizeMeasureId": 17, "inquiryResult": {"amount": 20.5}}
    usage = {"resourceType": None, "productNum": 2190, "inquiryResult": {"amount": 0}}
    return {"name": name, "totalPrice": {"amount": total},
            "cartListData": [{"selectedProduct": {"serviceCode": "ecs", "region": "sa-brazil-1", "chargeModeName": "PERIOD",
                                                  "productAllInfos": [vm, usage, disk]}}]}


def _read_xlsx(path):
    """{sheet name: [[cell text or number, ...] per row]}, straight from the zip (no spreadsheet library)."""
    import zipfile
    from xml.etree import ElementTree as ET
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    z = zipfile.ZipFile(path)
    names = [e.get("name") for e in ET.fromstring(z.read("xl/workbook.xml")).iterfind(".//m:sheet", ns)]
    out = {}
    for n, name in enumerate(names, 1):
        rows = []
        for row in ET.fromstring(z.read(f"xl/worksheets/sheet{n}.xml")).iterfind(".//m:row", ns):
            cells = []
            for c in row:
                t, v, f = c.find(".//m:t", ns), c.find("m:v", ns), c.find("m:f", ns)
                cells += [None] * (ord(c.get("r")[0]) - 65 - len(cells))  # empty cells are not written
                cells.append(t.text if t is not None else f.text if f is not None else float(v.text))
            rows.append(cells)
        out[name] = rows
    return out


def _fake_lists(monkeypatch, details):
    monkeypatch.setattr("autocalc.share.share_detail", lambda calc, lid: details[lid])


def test_export_quotes_xlsx_writes_the_four_sheets(monkeypatch, tmp_path, store):
    _fake_lists(monkeypatch, {"aaa": _detail("Acme prod", 320.5), "bbb": _detail("Acme dev", 100)})
    # a list published by publish_quote finds its draft on its own
    d = workflow.draft_quote("acme", [{"id": "web", "service": "ecs", "region": "sa-brazil-1", "billing": "monthly",
                                       "needs": {"vcpus": 4}}])
    workflow.revise_quote(d["draft_id"], [{"requirement_id": "web", "spec": "c7n.xlarge.2", "justification": "cheapest 4 vCPU"}])
    store.link("aaa", d["draft_id"])
    out = tmp_path / "q.xlsx"
    res = tools.export_quotes_xlsx([{"env": "prod", "list": "aaa"}, {"env": "dev & test", "list": "bbb"}], str(out))
    assert res["rows"] == 2 and res["total_usd"] == 420.5
    book = _read_xlsx(out)
    assert list(book) == ["Quotes", "Decisions", "Resources", "Totals"]
    q = book["Quotes"]
    assert q[0] == ["Environment", "Calculator", "Total (USD)", "Link"]
    assert q[1][:3] == ["prod", "Acme prod", 320.5] and "shareListId=aaa" in q[1][3]
    assert q[2][0] == "dev & test" and q[3][0] == "Total" and q[3][2] == "SUM(C2:C3)"
    dec = book["Decisions"]
    assert dec[1] == ["prod", "web", "ecs", "sa-brazil-1", "monthly", 1.0, "c7n.xlarge.2", "human", "cheapest 4 vCPU"]
    assert dec[2] == ["dev & test", "(no draft is recorded for this list)"]
    res_rows = book["Resources"]
    assert len(res_rows) == 1 + 2 * 2  # the usage line without a type is left out
    vm = res_rows[1]
    assert vm[5:11] == ["vm", "c7n.xlarge.2.linux", 3.0, 0.0, 12.0, 24.0]
    assert res_rows[2][5] == "volume" and res_rows[2][8] == 120.0
    tot = book["Totals"]
    assert tot[0][:6] == ["Environment", "Instances", "vCPUs", "RAM (GB)", "Storage (GB)", "Backup (GB)"]
    assert tot[1][:6] == ["prod", 3.0, 12.0, 24.0, 120.0, 0.0]
    assert tot[3][0] == "Total" and tot[3][1] == "SUM(B2:B3)"
    assert any("Not counted" in str(r[0]) for r in tot)


def test_export_quotes_xlsx_takes_a_named_draft(monkeypatch, tmp_path, store):
    _fake_lists(monkeypatch, {"ccc": _detail("Other", 10)})
    d = workflow.draft_quote("acme", [{"id": "web", "service": "ecs", "region": "sa-brazil-1", "billing": "monthly",
                                       "needs": {"vcpus": 4}}])
    out = tmp_path / "q.xlsx"
    tools.export_quotes_xlsx([{"env": "x", "list": "ccc", "draft_id": d["draft_id"]}], str(out))
    row = _read_xlsx(out)["Decisions"][1]
    assert row[:8] == ["x", "web", "ecs", "sa-brazil-1", "monthly", 1.0, "c7n.xlarge.2", "auto"]  # an exact match is confirmed by itself


def test_publish_remembers_which_draft_made_the_list(store):
    store.link("l1", "d-00000001")
    assert store.draft_for("l1") == "d-00000001" and store.draft_for("nope") is None


def test_export_quotes_xlsx_writes_nothing_when_a_list_is_gone(monkeypatch, tmp_path, store):
    def gone(calc, lid):
        raise tools.CalculatorError("no such list")
    monkeypatch.setattr("autocalc.share.share_detail", gone)
    out = tmp_path / "q.xlsx"
    with pytest.raises(ValidationError) as ei:
        tools.export_quotes_xlsx([{"env": "prod", "list": "zzz"}], str(out))
    assert "prod" in ei.value.message and not out.exists()
    with pytest.raises(ValidationError):
        tools.export_quotes_xlsx([{"env": "x", "list": "y"}], str(tmp_path / "q.csv"))


def test_reserved_instance_lines_take_their_size_from_the_cpu_and_mem_fields():
    from autocalc import summary
    ri = {"resourceType": "hws.resource.type.vm", "resourceSpecCode": "c7n.4xlarge.2.linux", "productNum": 2, "productSpecSysDesc": "",
          "cpu": "16dataInfo_36_", "mem": "32BSSUNIT.pluralUnit.102", "inquiryResult": {"amount": 1}}
    rows = summary.resources({"cartListData": [{"selectedProduct": {"productAllInfos": [ri]}}]})
    assert (rows[0]["vcpus"], rows[0]["ram_gb"], rows[0]["instances"]) == (32, 64, 2)
