"""Form recipes: option names -> the page's control ids, no catalog card."""

import pytest

from autocalc.errors import ValidationError
from autocalc.page.replay import card_steps
from autocalc.services import get_builder
from autocalc.services.forms import RECIPES


def test_options_become_the_form_state_in_recipe_order():
    rv = get_builder("redis").build("sa-brazil-1", "monthly", instances=2, version="calc_3_")["rewriteValue"]
    assert list(rv["template_RENDER"]) == ["calculator_redis_version_version", "calculator_redis_quantity_Stepper_0"]
    assert rv["global_PERIODTIME"]["UNSET_PeriodTime"] == {"measureValue": 1, "measureId": 20}
    assert [s.component_id for s in card_steps(rv)][-1] == "calculator_redis_quantity_Stepper_0"


def test_ondemand_hours_and_quantity_follow_the_recipe():
    rv = get_builder("memcached").build("sa-brazil-1", "ondemand", hours=100, quantity=3)["rewriteValue"]
    assert rv["global_ONDEMANDTIME"]["UNSET_Stepper_0"]["measureValue"] == 100
    assert rv["global_QUANTITY"]["UNSET_Stepper_0"]["measureValue"] == 3
    assert "global_PERIODTIME" not in rv


def test_unknown_option_is_refused_before_the_page_opens():
    with pytest.raises(ValidationError, match="no option 'flavour'"):
        get_builder("dds").build("sa-brazil-1", flavour="x")


def test_every_recipe_names_a_control_per_option():
    assert all(r.controls and all(c.startswith("calculator_") for c in r.controls.values()) for r in RECIPES.values())
