"""Builder registry: spec arguments and the verified list."""

import inspect

import pytest

from autocalc.services import REGISTRY, VERIFIED, get_builder, load_all


@pytest.fixture(scope="module", autouse=True)
def loaded():
    load_all()


def test_every_spec_arg_is_a_build_option():
    for svc in REGISTRY:
        b = get_builder(svc, calc=object())
        if b.spec_arg:
            assert b.spec_arg in inspect.signature(b.build).parameters, svc


def test_nat_maps_the_catalog_spec_to_its_size():
    assert get_builder("nat", calc=object()).spec_option("natgateway_small") == "small"


def test_every_verified_service_has_a_builder_and_a_version():
    assert set(VERIFIED) <= set(REGISTRY)
    assert all(v[:1].isdigit() for v in VERIFIED.values())


def test_every_recipe_service_is_verified_with_its_modes():
    from autocalc.services.forms import RECIPES
    assert set(RECIPES) <= set(VERIFIED)
    assert get_builder("hrds", calc=object()).modes == ("monthly", "yearly")


def test_search_rows_are_flat_and_smaller():
    import json

    from autocalc.tools import flat_sku
    sku = {"service": "ecs", "group": "ec2_vm", "spec": "t7.xlarge.2.linux",
           "description": "Memory:8192MB;vCPUs:4CORE;Remark:normal;Spot Duartion:On Demand, Period",
           "prices": {"monthly": {"amount": 14.38, "currency": "USD", "per": "1 month"},
                      "ondemand": {"amount": 0.0274, "currency": "USD", "per": "1 hour", "usage_factor": "Duration"}}}
    row = flat_sku(sku)
    assert row == {"spec": "t7.xlarge.2.linux", "description": "Memory:8192MB;vCPUs:4CORE", "monthly": 14.38, "ondemand": 0.0274}
    assert len(json.dumps(row)) < 0.6 * len(json.dumps(sku))


def test_compare_regions_names_its_argument_billing():
    import inspect

    from autocalc.tools import compare_regions
    assert "billing" in inspect.signature(compare_regions).parameters
