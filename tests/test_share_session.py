"""Offline tests for share.Session: cookies from the profile, csrf header, one silent re-read."""

from __future__ import annotations

import httpx
import pytest

from autocalc import auth
from autocalc.errors import CalculatorError
from autocalc.share import Session


@pytest.fixture
def profile_reads(monkeypatch):
    """Stand-in for ``auth.session_cookies``; records each call's ``refresh`` flag."""
    calls: list[bool] = []

    def fake(prof=None, refresh=False):
        calls.append(refresh)
        return f"cbc-sid=v{len(calls)}; csrf=tok{len(calls)}"

    monkeypatch.setattr(auth, "session_cookies", fake)
    return calls


def _transport(codes, seen):
    replies = iter(codes)

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"retCode": next(replies), "lists": []})

    return httpx.MockTransport(handler)


def test_cookies_and_csrf_header_from_profile(profile_reads):
    seen: list[httpx.Request] = []
    Session(transport=_transport(["200"], seen)).lists()
    assert profile_reads == [False]
    assert seen[0].headers["cookie"] == "cbc-sid=v1; csrf=tok1"
    assert seen[0].headers["csrf"] == "tok1"


def test_stale_session_rereads_profile_once(profile_reads):
    seen: list[httpx.Request] = []
    assert Session(transport=_transport(["CBC.0101", "200"], seen)).lists() == []
    assert profile_reads == [False, True]
    assert seen[1].headers["cookie"] == "cbc-sid=v2; csrf=tok2" and seen[1].headers["csrf"] == "tok2"


def test_second_rejection_raises_auth_expired(profile_reads):
    seen: list[httpx.Request] = []
    with pytest.raises(CalculatorError) as ei:
        Session(transport=_transport(["CBC.0101", "CBC.0101"], seen)).lists()
    assert ei.value.code == "AUTH_EXPIRED" and "autocalc login" in str(ei.value)
    assert profile_reads == [False, True] and len(seen) == 2


def test_explicit_header_skips_profile(profile_reads):
    seen: list[httpx.Request] = []
    Session("cbc-sid=given", transport=_transport(["200"], seen)).lists()
    assert profile_reads == [] and "csrf" not in seen[0].headers


def test_explicit_header_does_not_fall_back_to_another_profile_on_rejection(profile_reads):
    seen: list[httpx.Request] = []
    with pytest.raises(CalculatorError) as ei:
        Session("cbc-sid=given", transport=_transport(["CBC.0101"], seen)).lists()
    assert ei.value.code == "AUTH_EXPIRED"
    assert profile_reads == []
    assert len(seen) == 1
