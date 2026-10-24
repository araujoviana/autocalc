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
    monkeypatch.setattr(workflow, "encode_card", lambda svc, rv: {"page_card_for": svc, "form": rv})

    def fake_publish(name, cards, **kw):
        gate["cards"] = cards
        raise GateFailed("no", cards=[])

    monkeypatch.setattr(workflow, "publish_checked", fake_publish)
    with pytest.raises(GateFailed):
        workflow.publish_quote(d["draft_id"], "n")
    assert (built["svc"], built["flavor"], built["image"], built["quantity"]) == ("ecs", "c7n.xlarge.2", "AlmaLinux", 1)
    assert gate["cards"] == [{"page_card_for": "ecs", "form": {"form": 1}}]  # the page's card, not the builder's


def test_published_result_warns_when_the_frontend_changed(store, monkeypatch):
    d = workflow.draft_quote("acme", [req(needs={"vcpus": 2})])
    monkeypatch.setattr(workflow, "get_builder", lambda svc, calc=None: FakeBuilder(svc, {}))
    monkeypatch.setattr(workflow, "encode_card", lambda svc, rv: {})
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
    monkeypatch.setattr(workflow, "encode_card", lambda svc, rv: {})
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


def test_export_quotes_xlsx_writes_the_fixed_layout(monkeypatch, tmp_path):
    import zipfile
    lists = {"aaa": {"id": "aaa", "name": "Acme prod", "total": 120.5}, "bbb": {"id": "bbb", "name": "Acme dev", "total": 30}}
    monkeypatch.setattr(tools, "read_price_list", lambda ref: lists[ref])
    out = tmp_path / "q.xlsx"
    res = tools.export_quotes_xlsx([{"env": "prod", "list": "aaa"}, {"env": "dev & test", "list": "bbb"}], str(out))
    assert res["rows"] == 2 and res["total_usd"] == 150.5
    sheet = zipfile.ZipFile(out).read("xl/worksheets/sheet1.xml").decode()
    assert sheet.index("Environment") < sheet.index("Acme prod") < sheet.index("Acme dev") < sheet.index("SUM(C2:C3)")
    assert "dev &amp; test" in sheet and "shareListId=aaa" in sheet


def test_export_quotes_xlsx_writes_nothing_when_a_list_is_gone(monkeypatch, tmp_path):
    def gone(ref):
        raise tools.CalculatorError("no such list")
    monkeypatch.setattr(tools, "read_price_list", gone)
    out = tmp_path / "q.xlsx"
    with pytest.raises(ValidationError) as ei:
        tools.export_quotes_xlsx([{"env": "prod", "list": "zzz"}], str(out))
    assert "prod" in ei.value.message and not out.exists()
    with pytest.raises(ValidationError):
        tools.export_quotes_xlsx([{"env": "x", "list": "y"}], str(tmp_path / "q.csv"))
