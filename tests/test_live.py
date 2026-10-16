"""Live tests (network). Run with `pytest -m live`. Read-only, no credentials."""

import pytest

from autocalc.availability import Availability
from autocalc.client import Calculator
from autocalc.regions import RegionResolver

pytestmark = pytest.mark.live


@pytest.fixture(scope="module")
def calc():
    return Calculator()


def test_catalog_has_services(calc):
    svcs = {s["service"] for s in calc.services()}
    assert {"ecs", "rds", "obs", "cce", "evs"} <= svcs


def test_region_resolves(calc):
    r = RegionResolver.from_menu(calc.menu())
    assert r.resolve("Santiago") == "la-south-2"


def test_availability(calc):
    av = Availability(calc)
    assert av.service_in_region("ecs", "sa-brazil-1")
    assert "PERIOD" in av.modes_in_region("ecs", "sa-brazil-1")
    assert not av.service_in_region("sfs", "la-south-2")


def test_quote_monthly(calc):
    q = calc.quote("sa-brazil-1", [{"service": "ecs", "spec": "c7n.large.2.linux", "quantity": 1}], billing="monthly")
    assert q["total"] > 0 and q["currency"] == "USD"
