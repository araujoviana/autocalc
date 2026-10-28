"""OBS billing selection must match the requested availability zone and capacity."""

import copy
from types import SimpleNamespace

import pytest

from autocalc.errors import SpecNotFound
from autocalc.services.obs import ObsBuilder
from tests.support.obs_rebuild import options


@pytest.mark.parametrize(("storage_class", "factor", "expected"), [
    ("standard", "size", "size_3az"),
    ("standard", "size_3az", "size_3az"),
    ("warm", "size_warm", "size_warm_3az"),
])
@pytest.mark.parametrize(("unit", "value", "rated"), [("GB", 3, 3), ("TB", 2, 2048)])
def test_multi_az_uses_matching_plan_and_rated_gb(storage_class, factor, expected, unit, value, rated, monkeypatch):
    token = {"standard": "dataInfo_2_", "warm": "dataInfo_3_"}[storage_class]
    catalog = {"resourceSpecCode": "obs.001", "storageType": token, "planList": [
        {"billingMode": "ONDEMAND", "usageFactor": expected, "usageMeasureId": 17, "amount": 1}
    ]}
    original = copy.deepcopy(catalog)
    calc = SimpleNamespace(product_info=lambda *_: {"product": {"obs_obs": [catalog]}})
    builder = ObsBuilder(calc)
    monkeypatch.setattr(builder, "assemble", lambda *args, **kwargs: (args[5], args[7]))
    products, render = builder.build("test", [{"factor": factor, "value": value, "unit": unit}],
                                     storage_class=storage_class, multi_az=True)
    assert products[0]["usageFactor"] == expected
    assert products[0]["usageMeasureId"] == 17
    assert products[0]["usageValue"] == rated
    assert render["calculator_multiAZ_radio"]["UNSET_Stepper_0"]["measureValue"] == value
    assert catalog == original


def test_missing_factor_is_not_replaced_with_another_plan():
    item = {"resourceSpecCode": "obs.001", "storageType": "dataInfo_2_", "planList": []}
    calc = SimpleNamespace(product_info=lambda *_: {"product": {"obs_obs": [item]}})
    with pytest.raises(SpecNotFound):
        ObsBuilder(calc)._item("test", "size_3az", "standard", "obs.001")


def test_rebuild_converts_rated_gb_back_to_display_tb():
    card = {"selectedProduct": {"region": "test", "productAllInfos": [{
        "resourceSpecCode": "obs.001", "usageFactor": "size_3az", "storageType": "dataInfo_2_",
        "multiAZType": "dataInfo_5_", "usageValue": 2048, "usageMeasureId": 17,
        "addToList_product": "Standard | 2TB | multi-AZ"}]}}
    assert options(card)["components"][0]["value"] == 2
