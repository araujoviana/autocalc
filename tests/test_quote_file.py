"""Declarative quotes: parse, offline validation, plan without side effects, lock file, apply."""

from decimal import Decimal
from pathlib import Path

import pytest

from autocalc import quote_file, tools, workflow
from autocalc.core import Candidate, DraftStore
from autocalc.errors import ValidationError
from autocalc.schema import generate
from autocalc.schema.model import Control, Range, ServiceSchema

SAMPLE = Path(__file__).parent / "fixtures/quotes/sample.yaml"


class FakeProvider:
    name = "fake"
    prices = {"c7n.large.2": "10", "c7n.xlarge.2": "20"}

    def candidates(self, req):
        specs = {"c7n.large.2": 2, "c7n.xlarge.2": 4}
        return [Candidate(s, req.region, req.billing, Decimal(self.prices[s]), {"vcpus": v, "memory_gb": v * 2})
                for s, v in specs.items()]


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOCALC_DATA", str(tmp_path))
    monkeypatch.setattr(workflow, "HuaweiProvider", lambda calc: FakeProvider())
    monkeypatch.setattr("autocalc.providers.huawei.HuaweiProvider", lambda calc: FakeProvider())
    monkeypatch.setattr(tools, "_region", lambda v: v)
    return tmp_path


def quote(tmp_path, text=None):
    p = tmp_path / "q.yaml"
    p.write_text(text or SAMPLE.read_text(encoding="utf-8"), encoding="utf-8")
    return quote_file.load(p)


def test_defaults_apply(tmp_path):
    q = quote(tmp_path)
    assert q.cards[0]["region"] == "sa-brazil-1" and q.cards[0]["billing"] == "monthly"


def test_unknown_option_names_card_field_and_legal_options(tmp_path):
    q = quote(tmp_path)
    q.cards[0]["options"] = {"sytem_disk_gb": 100}
    (err,) = quote_file.validate(q)
    assert (err["card"], err["field"]) == ("web", "sytem_disk_gb") and "system_disk" in err["allowed"]
    assert "schema" in err["hint"]


def test_out_of_range_names_the_range_and_starts_no_browser(tmp_path, monkeypatch):
    schema = ServiceSchema(service="ecs", controls=[
        Control(id="c", kind="base-stepper", option="bandwidth_mbit", ranges=[Range(min=1, max=2000)])])
    monkeypatch.setattr(generate, "load_service", lambda s: schema)
    monkeypatch.setattr("autocalc.page.browser.page_context", lambda *a, **k: pytest.fail("browser started"))
    q = quote(tmp_path)
    q.cards[0]["options"] = {"bandwidth_mbit": 5000}
    (err,) = quote_file.validate(q)
    assert err["range"]["max"] == 2000 and "outside the range 1..2000" in err["error"]


def test_valid_sample_has_no_errors_and_missing_size_is_reported(tmp_path):
    q = quote(tmp_path)
    assert quote_file.validate(q) == []
    del q.cards[0]["needs"]
    assert quote_file.validate(q)[0]["field"] == "spec"


def test_plan_resolves_exact_prices_it_and_writes_a_lock(env, tmp_path):
    q = quote(tmp_path)
    q.cards[0]["needs"] = {"vcpus": 4, "memory_gb": 8}
    q.cards[0]["options"] = {}
    out = quote_file.plan(q)
    assert out["cards"][0]["spec"] == "c7n.xlarge.2" and out["cards"][0]["price"] == "20"
    assert '"c7n.xlarge.2"' in (tmp_path / "q.lock.json").read_text(encoding="utf-8")


def test_plan_shows_candidates_for_an_ambiguous_card_and_apply_refuses(env, tmp_path, monkeypatch):
    q = quote(tmp_path)
    q.cards[0].update(needs={"vcpus": 1}, options={})
    out = quote_file.plan(q)
    assert out["pending"] and out["cards"][0]["candidates"]
    monkeypatch.setattr(workflow, "publish_quote", lambda *a, **k: pytest.fail("published"))
    with pytest.raises(ValidationError, match="unresolved"):
        quote_file.apply(q)


def test_a_moved_price_is_reported_and_blocks_apply_but_keeps_the_pin(env, tmp_path, monkeypatch):
    q = quote(tmp_path)
    q.cards[0].update(needs={"vcpus": 4, "memory_gb": 8}, options={})
    quote_file.plan(q)
    monkeypatch.setitem(FakeProvider.prices, "c7n.xlarge.2", "25")
    out = quote_file.plan(q)
    assert out["cards"][0]["lock_drift"] == {"locked_price": "20", "price": "25"}
    monkeypatch.setattr(workflow, "publish_quote", lambda *a, **k: pytest.fail("published"))
    with pytest.raises(ValidationError, match="changed price"):
        quote_file.apply(q)


def test_apply_publishes_through_publish_quote(env, tmp_path, monkeypatch):
    q = quote(tmp_path)
    q.cards[0].update(needs={"vcpus": 4, "memory_gb": 8}, options={"bandwidth_mbit": 10})
    monkeypatch.setattr(workflow, "publish_quote", lambda did, name, settlement: {"url": "u", "draft_id": did, "name": name})
    assert quote_file.apply(q)["name"] == "[autocalc] example"
    assert DraftStore().load(quote_file.plan(q)["draft_id"]).requirements


def test_schema_resources_need_no_browser_and_prompt_names_the_new_tools(monkeypatch):
    import asyncio

    from autocalc import server
    monkeypatch.setattr("autocalc.page.browser.page_context", lambda *a, **k: pytest.fail("browser started"))
    names = {t.name for t in server.mcp._tool_manager.list_tools()}
    assert {"plan_quote", "apply_quote"} <= names
    index = asyncio.run(server.mcp.read_resource("autocalc://schema/index"))
    assert "autocalc://schema/ecs" in next(iter(index)).content
    ecs = asyncio.run(server.mcp.read_resource("autocalc://schema/ecs"))
    assert "calculator_ecs_radio_arch" in next(iter(ecs)).content
    prompt = server.quote_workflow()
    assert "plan_quote" in prompt and "autocalc://schema/" in prompt


def test_option_error_lists_legal_values_and_points_to_the_schema(env, tmp_path):
    q = quote(tmp_path)
    q.cards[0]["options"] = {"sytem_disk_gb": 100}
    with pytest.raises(ValidationError) as exc:
        quote_file.plan(q)
    assert "system_disk" in exc.value.hint and "autocalc://schema" in exc.value.hint or "schema" in exc.value.hint


@pytest.mark.parametrize("card", [
    {"id": "a"}, {"id": "a", "service": ""}, {"id": "a", "service": "../ecs", "region": "r", "billing": "monthly"},
    {"id": "a", "service": None, "region": "r", "billing": "monthly"}, {"id": "a", "service": "ecs", "options": [1]},
    {"id": "a", "service": "ecs", "region": "r", "billing": "weekly", "options": {"bandwidth_mbit": "ten"}},
    {"id": "a", "service": "ecs", "region": "r", "billing": "monthly", "options": {"bandwidth_mbit": True}},
    {"id": "a", "service": "ecs", "region": "r", "billing": "monthly", "needs": {"vcpus": 1}, "surprise": 1},
])
def test_validate_reports_garbage_instead_of_raising(card):
    errors = quote_file.validate(quote_file.Quote(customer="c", cards=[card]))
    assert errors and all(e["field"] and e["error"] for e in errors)


@pytest.mark.parametrize("text", ["", "[]", "cards: []", "customer: x\ncards: [1]", "customer: x\ncards: {a: 1}",
                                  "customer: x\ndefaults: {color: red}\ncards: [{id: a}]", ": : :"])
def test_parse_rejects_malformed_files_with_a_validation_error(text):
    with pytest.raises((ValidationError, __import__("yaml").YAMLError)):
        quote_file.parse(text)


def test_duplicate_card_ids_are_refused_before_any_work(env, tmp_path):
    q = quote(tmp_path)
    q.cards.append(dict(q.cards[0]))
    with pytest.raises(ValidationError, match="unique"):
        quote_file.plan(q)


def test_a_corrupt_lock_file_is_not_silently_replaced(env, tmp_path):
    q = quote(tmp_path)
    q.cards[0].update(needs={"vcpus": 4, "memory_gb": 8}, options={})
    (tmp_path / "q.lock.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(ValueError):
        quote_file.plan(q)
    assert (tmp_path / "q.lock.json").read_text(encoding="utf-8") == "{not json"


def test_plan_makes_no_website_call(env, tmp_path, monkeypatch):
    import autocalc.share as share
    for name in ("create", "update", "copy", "delete", "lists"):
        monkeypatch.setattr(share.Session, name, lambda *a, **k: pytest.fail("website touched"), raising=False)
    q = quote(tmp_path)
    q.cards[0].update(needs={"vcpus": 4, "memory_gb": 8}, options={})
    quote_file.plan(q)


def test_a_changed_size_request_is_not_silently_resolved_to_the_old_pin(env, tmp_path):
    q = quote(tmp_path)
    q.cards[0].update(needs={"vcpus": 4, "memory_gb": 8}, options={})
    quote_file.plan(q)
    lock_before = (tmp_path / "q.lock.json").read_text(encoding="utf-8")
    q.cards[0]["needs"] = {"vcpus": 1}
    out = quote_file.plan(q)
    assert out["pending"] and out["cards"][0]["candidates"] and "spec" not in out["cards"][0]
    assert (tmp_path / "q.lock.json").read_text(encoding="utf-8") == lock_before
