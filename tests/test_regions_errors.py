"""Unit tests for the region resolver and error model (E1, D3) - no network."""

import pytest

from autocalc.errors import (
    AuthExpired,
    RegionAmbiguous,
    RegionNotFound,
    SpecNotFound,
    ValidationError,
    raise_for_exception,
)
from autocalc.regions import RegionResolver

NAMES = {"sa-brazil-1": "LA-Sao Paulo1", "la-south-2": "LA-Santiago", "na-mexico-1": "NA-Mexico City1",
         "la-north-2": "LA-Mexico City2", "sa-peru-1": "LA-Lima", "sa-argentina-1": "LA-Buenos Aires",
         "af-south-1": "AF-Johannesburg", "ap-southeast-3": "AP-Singapore"}
R = RegionResolver(NAMES)


@pytest.mark.parametrize("query,expected", [
    ("Santiago", "la-south-2"), ("Chile", "la-south-2"),
    ("Sao Paulo", "sa-brazil-1"), ("São Paulo", "sa-brazil-1"), ("Brazil", "sa-brazil-1"),
    ("Lima", "sa-peru-1"), ("Buenos Aires", "sa-argentina-1"),
    ("Johannesburg", "af-south-1"), ("Singapore", "ap-southeast-3"),
    ("la-north-2", "la-north-2"), ("LA-Mexico City2", "la-north-2"),
])
def test_resolve_aliases(query, expected):
    assert R.resolve(query) == expected


def test_region_id_wins_over_substring():
    assert R.resolve("na-mexico-1") == "na-mexico-1"


def test_ambiguous_mexico():
    with pytest.raises(RegionAmbiguous) as e:
        R.resolve("Mexico")
    assert set(e.value.choices) == {"na-mexico-1", "la-north-2"}


def test_unknown_region():
    with pytest.raises(RegionNotFound):
        R.resolve("Gotham")


def test_exception_mapping():
    with pytest.raises(AuthExpired):
        raise_for_exception({"exceptionId": "CBC.0101"})
    with pytest.raises(SpecNotFound):
        raise_for_exception({"exceptionId": "CBC.6006", "descArgs": "not sold"})
    with pytest.raises(ValidationError):
        raise_for_exception({"exceptionId": "CBC.6001"})
    # success does not raise
    raise_for_exception({"exceptionId": "CBC.0000"})


def test_error_as_dict_has_hint():
    e = SpecNotFound("nope", hint="pick another")
    d = e.as_dict()
    assert d["error"] == "SPEC_NOT_FOUND" and d["hint"] == "pick another"


def _answers(monkeypatch, statuses):
    """A Calculator whose rating endpoint answers ``statuses`` in turn (200 carries a price)."""
    import httpx

    from autocalc.client import Calculator

    seen = iter(statuses)

    def handler(request):
        code = next(seen)
        return httpx.Response(code, json={"ok": 1} if code == 200 else {"message": "slow down"})

    calc = Calculator()
    calc.http = httpx.Client(transport=httpx.MockTransport(handler))
    monkeypatch.setattr("autocalc.client.time.sleep", lambda s: None)
    return calc


def test_inquiry_retries_a_429(monkeypatch):
    assert _answers(monkeypatch, [429, 200]).inquiry({}) == {"ok": 1}


def test_inquiry_gives_up_on_a_persistent_429(monkeypatch):
    from autocalc.errors import UpstreamError

    with pytest.raises(UpstreamError):
        _answers(monkeypatch, [429, 429, 429]).inquiry({})
