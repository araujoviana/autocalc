"""Live page-encoder tests (network + a headless browser). Run with `pytest -m live -k page`.
Anonymous: no login and nothing saved."""

from concurrent.futures import ThreadPoolExecutor

import pytest

from autocalc.client import Calculator
from autocalc.page.ecs import encode_ecs
from autocalc.page.store import cents
from tests.support.page_rating import rerate

pytestmark = pytest.mark.live
REGION = "sa-brazil-1"


@pytest.fixture(scope="module")
def calc():
    return Calculator()


def test_page_monthly_card_matches_the_rating_engine(calc):
    card = encode_ecs(REGION, "c7n.large.2", "monthly", calc=calc, image="Ubuntu", system_disk=("GPSSD", 40),
                      data_disks=[("GPSSD", 50)], bandwidth_mbit=5)
    sp = card["selectedProduct"]
    assert sp["chargeModeName"] == "MONTHLY" and sp["region"] == REGION
    assert cents(sp["amount"]) == rerate(card, calc)


def test_page_concurrent_encodes_are_isolated(calc):
    flavors = ["c7n.large.2", "c7n.xlarge.2"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        cards = list(pool.map(lambda f: encode_ecs(REGION, f, "monthly", calc=Calculator(), image="Ubuntu"), flavors))
    for flavor, card in zip(flavors, cards, strict=True):
        vms = [p for p in card["selectedProduct"]["productAllInfos"] if p.get("resourceType") == "hws.resource.type.vm"]
        assert [p["resourceSpecCode"] for p in vms] == [f"{flavor}.linux"]
