"""Offline tests for the region sweep's retry of page-load timeouts (tests.support.region_sweep)."""

from __future__ import annotations

import pytest

from autocalc.errors import PageEncodeFailed
from tests.support import region_sweep


def _fail(step: str) -> PageEncodeFailed:
    return PageEncodeFailed("boom", service="ecs", step=step)


def _encode_calls(monkeypatch, outcomes: list) -> list:
    """Make encode_card return/raise ``outcomes`` in turn; return the list of calls it saw."""
    calls: list = []

    def fake(service, rewrite_value, *, timeout=None):
        calls.append(timeout)
        out = outcomes[len(calls) - 1]
        if isinstance(out, Exception):
            raise out
        return out

    monkeypatch.setattr(region_sweep, "encode_card", fake)
    monkeypatch.setattr(region_sweep.time, "sleep", lambda s: None)
    return calls


def test_a_load_timeout_is_retried_with_the_short_timeout(monkeypatch):
    calls = _encode_calls(monkeypatch, [_fail("open"), _fail("price"), {"ok": 1}])
    assert region_sweep.encode("ecs", {}) == {"ok": 1}
    assert calls == [10, 10, 10]


def test_a_form_mismatch_is_not_retried(monkeypatch):
    calls = _encode_calls(monkeypatch, [_fail("form"), {"ok": 1}])
    with pytest.raises(PageEncodeFailed):
        region_sweep.encode("ecs", {})
    assert len(calls) == 1


def test_gives_up_after_three_tries(monkeypatch):
    calls = _encode_calls(monkeypatch, [_fail("open")] * 3)
    with pytest.raises(PageEncodeFailed):
        region_sweep.encode("ecs", {})
    assert len(calls) == 3


def test_a_disabled_add_to_list_and_a_missing_period_option_are_retried(monkeypatch):
    period = PageEncodeFailed("not offered", service="ecs", field="global_PERIODTIME_UNSET_PeriodTime")
    calls = _encode_calls(monkeypatch, [_fail("add_to_list"), period, {"ok": 1}])
    assert region_sweep.encode("ecs", {}) == {"ok": 1}
    assert len(calls) == 3
