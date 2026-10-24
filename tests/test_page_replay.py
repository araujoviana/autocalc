"""Offline tests for replaying a builder's form state on the page (autocalc.page.replay)."""

from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from autocalc.errors import PageEncodeFailed
from autocalc.page import replay
from autocalc.page.driver import Driver, Step
from tests.test_page import FakeClock, FakePage

M = lambda v: {"measureId": 17, "measureValue": v, "measureNameBeforeTrans": ""}  # noqa: E731

STATE = {
    "global_REGIONINFO": {"region": "sa-brazil-1", "chargeMode": "PERIOD"},
    "global_PERIODTIME": {"UNSET_PeriodTime": {"measureValue": 2, "measureId": 20}},
    "global_QUANTITY": {"UNSET_Stepper_0": M(3)},
    "template_RENDER": {
        "calculator_ecs_radio": {"arch": "dataInfo_1_"},
        "calculator_evs_stepper": {
            "calculator_evs_stepper_main": {"type": "t1", "UNSET_Stepper_0": M(40)},
            "calculator_evs_stepper_|addible0|_0": {"type": "t1", "UNSET_Stepper_0": M(50)},
            "calculator_evs_stepper_|addible0|_1": {"type": "t1", "UNSET_Stepper_0": M(60)},
        },
        "calculator_sfsPeriod_36input": 3.6,
    },
}


def test_card_steps_flatten_globals_rows_and_measures():
    steps = replay.card_steps(STATE)
    assert steps[:3] == [Step("global_REGIONINFO_region", "region", "sa-brazil-1"),
                         Step("global_REGIONINFO_chargeMode", "radio", "PERIOD"),
                         Step("global_PERIODTIME_UNSET_PeriodTime", "radio", "2_20")]
    assert Step("calculator_evs_stepper_main_Stepper_0", "auto", 40) in steps
    assert Step("calculator_sfsPeriod_36input", "auto", 3.6) in steps
    assert steps[-1] == Step("global_QUANTITY_Stepper_0", "auto", 3)
    adds = [i for i, s in enumerate(steps) if s.kind == "add"]
    assert len(adds) == 2  # one click per row, not per leaf
    assert steps[adds[1] + 1] == Step("calculator_evs_stepper_|addible0|_1_type", "auto", "t1")


def _driver(page, clock):
    return Driver(page, "elb", timeout=5, quiet=1.5, clock=clock)


def test_hidden_control_is_skipped_only_when_the_form_holds_the_value():
    clock = FakeClock()
    form = {"template_RENDER": {"value": {"calculator_ip": {"UNSET_Stepper_0": M(2)}}}}
    _driver(FakePage(clock, describe=None, formState=form), clock).apply(Step("calculator_ip_Stepper_0", "auto", 2))
    with pytest.raises(PageEncodeFailed) as ei:
        _driver(FakePage(clock, describe=None, formState=form), clock).apply(Step("calculator_ip_Stepper_0", "auto", 3))
    assert ei.value.details["field"] == "calculator_ip_Stepper_0"


def test_stepper_is_read_back_from_the_form_state():
    clock = FakeClock()
    form = {"template_RENDER": {"value": {"calculator_sfsPeriod_36input": 3.6}}}  # the page kept the old value
    page = FakePage(clock, describe={"kind": "common-input", "id": "x", "options": []}, formState=form, readBack="1.2")
    with pytest.raises(PageEncodeFailed) as ei:
        _driver(page, clock).apply(Step("calculator_sfsPeriod_36input", "auto", 1.2))
    assert "shows 3.6 after typing 1.2" in ei.value.message


def test_unknown_control_kind_fails_with_its_name():
    clock = FakeClock()
    page = FakePage(clock, describe={"kind": "base-slider", "id": "x", "options": []})
    with pytest.raises(PageEncodeFailed) as ei:
        _driver(page, clock).apply(Step("calculator_x", "auto", 1))
    assert "base-slider" in ei.value.message


def _encode(monkeypatch, *cards):
    """encode_card with a page that returns ``cards`` in turn; returns the card and how many were captured."""
    served = iter(cards)
    @contextmanager
    def ctx(_service):
        yield SimpleNamespace(new_page=lambda: None)

    class FakeDriver:
        frontend_version = "11.4.201"

        def __init__(self, *a, **k):
            pass

        open = run = lambda self, *a: None
        capture = lambda self: next(served)  # noqa: E731

    monkeypatch.setattr("autocalc.page.browser.page_context", ctx)
    monkeypatch.setattr("autocalc.page.driver.Driver", FakeDriver)
    return replay.encode_card("sfsturbo", STATE)


PRICED = {"region": "sa-brazil-1", "chargeMode": "PERIOD"}  # what STATE asks for


def _card(**product):
    return {"rewriteValue": {"template_RENDER": STATE["template_RENDER"]}, "selectedProduct": {**PRICED, **product}}


def test_encode_card_tries_again_when_the_page_priced_another_region(monkeypatch):
    bad, good = _card(region="ap-southeast-1"), _card()
    assert _encode(monkeypatch, bad, good) is good


def test_encode_card_fails_naming_the_region_after_three_wrong_tries(monkeypatch):
    with pytest.raises(PageEncodeFailed) as ei:
        _encode(monkeypatch, *[_card(region="ap-southeast-1")] * 3)
    assert ei.value.details["step"] == "region" and "ap-southeast-1" in ei.value.message


def test_encode_card_names_the_charge_mode_when_that_differs(monkeypatch):
    with pytest.raises(PageEncodeFailed) as ei:
        _encode(monkeypatch, *[_card(chargeMode="ONDEMAND")] * 3)
    assert ei.value.details["step"] == "chargeMode"


def test_priced_elsewhere_ignores_a_region_that_was_not_asked():
    regionless = {"global_REGIONINFO": {"chargeMode": "PERIOD"}}
    assert replay.priced_elsewhere(regionless, _card(region="anywhere")) is None


def test_encode_card_accepts_a_text_input_value_that_means_the_same(monkeypatch):
    got = {"calculator_ecs_radio": {"arch": "dataInfo_1_"}, "calculator_sfsPeriod_36input": "3.6",
           "calculator_evs_stepper": STATE["template_RENDER"]["calculator_evs_stepper"]}
    card = {"rewriteValue": {"template_RENDER": got}, "selectedProduct": PRICED}
    assert _encode(monkeypatch, card) is card


def test_encode_card_fails_when_the_page_card_lacks_a_requested_value(monkeypatch):
    got = dict(STATE["template_RENDER"], calculator_ecs_radio={"arch": "dataInfo_9_"})
    with pytest.raises(PageEncodeFailed) as ei:
        _encode(monkeypatch, {"rewriteValue": {"template_RENDER": got}})
    assert ei.value.details["step"] == "form" and ei.value.details["field"] == "calculator_ecs_radio_arch"
