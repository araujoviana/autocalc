import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from autocalc.schema import generate
from autocalc.schema.model import ServiceSchema

RAW = json.loads((Path(__file__).parent / "fixtures/schema/ecs_controls.json").read_text(encoding="utf-8"))


def test_format_accepts_valid_and_rejects_invalid():
    good = {"service": "ecs", "controls": [{"id": "a", "kind": "base-select", "option": "image"}]}
    assert ServiceSchema.model_validate(good).controls[0].option == "image"
    with pytest.raises(ValidationError):
        ServiceSchema.model_validate({"service": "ecs", "controls": [{"id": "a"}]})  # kind missing
    with pytest.raises(ValidationError):
        ServiceSchema.model_validate({"service": "ecs", "controls": [], "surprise": 1})


def test_generation_is_identical_twice_and_in_form_order():
    first = generate.dump(generate.build("ecs", RAW, "1.2.3"))
    again = generate.dump(generate.build("ecs", RAW, "1.2.3", generate.load(first)))
    assert first == again
    s = generate.build("ecs", RAW, "1.2.3")
    assert s.controls[0].id == "global_REGIONINFO_region" and s.controls[0].after == []
    assert s.controls[4].after == [s.controls[3].id]


def test_ranges_keep_their_condition_and_catalog_values_are_marked():
    s = {c.id: c for c in generate.build("ecs", RAW, None).controls}
    bw = s["calculator_eip_radio_Stepper_1"].ranges
    assert {(r.min, r.when) for r in bw} >= {(5, "^19_share"), (1, "^19_s?bgp")}
    assert s["calculator_ecs_radio_arch"].values == "catalog"
    assert s["calculator_evs_stepper_main_Stepper_0"].ranges[0].step == 10


def test_hand_written_fields_survive_regeneration():
    first = generate.build("ecs", RAW, "1")
    first.controls[3].option, first.controls[3].note = "arch", "x86 or arm"
    text = generate.dump(first)
    second = generate.build("ecs", RAW, "2", generate.load(text))
    assert (second.controls[3].option, second.controls[3].note) == ("arch", "x86 or arm")
    assert second.frontend == "2"


def test_coverage_counts_mapped_unmapped_and_unsupported():
    s = generate.build("ecs", RAW, None)
    s.controls[0].option = "region"
    s.controls[1].unsupported = True
    c = generate.coverage(s)
    assert c["mapped"] == ["global_REGIONINFO_region"] and c["unsupported"] == [s.controls[1].id]
    assert c["mapped_percent"] == round(100 / 18)


def test_diff_reports_added_removed_changed_and_ignores_notes():
    old = generate.build("ecs", RAW, None)
    old.controls[2].note = "hand-written"
    new = generate.build("ecs", RAW[1:] + [{**RAW[0], "id": "new_control", "y": 9999}], None)
    d = generate.diff(old, new)
    assert d["added"] == ["new_control"] and d["removed"] == [RAW[0]["id"]]
    assert generate.diff(old, generate.build("ecs", RAW, None, old)) == {"added": [], "removed": [], "changed": []}


def test_every_recipe_control_is_in_its_schema_under_the_recipe_option():
    from autocalc.services.forms import RECIPES
    for svc, recipe in RECIPES.items():
        schema = generate.load_service(svc)
        assert schema is not None, f"no schema for {svc}; run `autocalc schema pull {svc}`"
        by_id = {c.id: c for c in schema.controls}
        for option, control_id in recipe.controls.items():
            assert control_id in by_id, f"{svc}: recipe control {control_id} is not on the page schema"
            assert by_id[control_id].option == option and not by_id[control_id].unsupported, (svc, option)
