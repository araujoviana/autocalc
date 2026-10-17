from decimal import Decimal as D

import pytest

from autocalc.client import Sku
from autocalc.core import Requirement
from autocalc.errors import ServiceNotSold, ValidationError
from autocalc.providers.huawei import HuaweiProvider


class FakeCalc:
    calls = 0

    def skus(self, service, region):
        FakeCalc.calls += 1
        d = "vCPUs: 4 | Memory: 16384 MB"
        return [Sku(service, "ec2_vm", "t", "r", "c7n.xlarge.4", d, {"monthly": {"amount": 0.1234567}}),
                Sku(service, "ec2_vm", "t", "r", "s6.xlarge.4", d, {"ondemand": {"amount": 1}}),
                Sku(service, "evs", "t", "r", "SSD", "disk", {"monthly": {"amount": 3}})]


class FakeAvail:
    def check_mode(self, service, region, billing):
        if region == "nowhere":
            raise ServiceNotSold("no", details={"available_regions": ["sa-brazil-1"]})


def provider():
    return HuaweiProvider(FakeCalc(), FakeAvail())


def req(**kw):
    return Requirement("r", "ecs", kw.pop("region", "sa-brazil-1"), kw.pop("billing", "monthly"), **kw)


def test_candidates_are_priced_skus_for_the_mode_with_sizes_and_generation():
    c = provider().candidates(req())
    assert [x.spec for x in c] == ["c7n.xlarge.4", "SSD"]
    assert c[0].price == D("0.1234567") and c[0].has == {"vcpus": 4.0, "memory_gb": 16.0} and c[0].generation == 7
    assert c[1].has == {} and c[1].generation == 0
    assert [x.spec for x in provider().candidates(req(group="ec2_vm"))] == ["c7n.xlarge.4"]


def test_unavailable_region_raises_instead_of_returning_empty():
    with pytest.raises(ServiceNotSold) as ei:
        provider().candidates(req(region="nowhere"))
    assert ei.value.details["available_regions"] == ["sa-brazil-1"]


def test_ri_is_rejected_before_any_catalog_call():
    FakeCalc.calls = 0
    with pytest.raises(ValidationError) as ei:
        provider().candidates(req(billing="ri"))
    assert ei.value.details["field"] == "billing" and ei.value.details["allowed"] == ["ondemand", "monthly", "yearly"]
    assert FakeCalc.calls == 0
