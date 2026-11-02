"""Invariants over every committed schema file, and the failure modes of reading them."""

import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError as PydanticError

from autocalc import cli, services
from autocalc.schema import generate
from autocalc.schema.model import ServiceSchema
from autocalc.services import VERIFIED
from autocalc.services.forms import RECIPES

FILES = sorted(generate.FILES.glob("*.yaml"))
IDS = [f.stem for f in FILES]


def test_every_verified_service_has_a_schema():
    services.load_all()
    missing = sorted(set(VERIFIED) - set(IDS))
    assert not missing, f"no schema for {missing}: run `autocalc schema pull <service>`"


@pytest.mark.parametrize("path", FILES, ids=IDS)
def test_schema_file_is_wellformed(path):
    text = path.read_text(encoding="utf-8")
    schema = generate.load(text)
    assert schema.service == path.stem and schema.frontend
    ids = [c.id for c in schema.controls]
    assert len(ids) == len(set(ids)), "duplicate control id"
    known = set(ids)
    for c in schema.controls:
        assert set(c.after) <= known, f"{c.id}: after names a control that is not in the file"
        assert c.id not in c.after
        for r in c.ranges:
            assert r.min is None or r.max is None or r.min <= r.max, f"{c.id}: range min > max"
            assert r.step > 0
    assert generate.dump(schema) == text, "file is not in canonical form: regenerate with `autocalc schema pull`"


@pytest.mark.parametrize("path", FILES, ids=IDS)
def test_order_chain_has_no_cycle_and_one_root(path):
    schema = generate.load(path.read_text(encoding="utf-8"))
    roots = [c for c in schema.controls if not c.after and not c.modes]
    assert len(roots) == 1, "the form-order chain starts at exactly one control"
    by_id = {c.id: c for c in schema.controls}
    for c in schema.controls:
        seen, cur = set(), c
        while cur.after:
            assert cur.id not in seen, f"cycle at {cur.id}"
            seen.add(cur.id)
            cur = by_id[cur.after[0]]


def test_all_schemas_share_one_frontend_version():
    versions = {generate.load(f.read_text(encoding="utf-8")).frontend for f in FILES}
    assert len(versions) == 1, f"schemas were pulled on different frontends: {versions}; re-pull the stale ones"


def test_recipe_services_leave_no_control_unaccounted_for():
    for svc in RECIPES:
        for c in generate.load_service(svc).controls:
            assert c.option or c.unsupported, f"{svc}: {c.id} is neither mapped nor marked unsupported"


@pytest.mark.parametrize("bad", [
    "service: x\ncontrols: [{id: a, kind: k, after_source: guess}]",
    "service: x\ncontrols: [{id: a, kind: k, ranges: [{min: low}]}]",
    "service: x\ncontrols: [{id: a, kind: k, values: static}]",
    "service: x",
    "- not a mapping",
    "",
])
def test_malformed_schema_is_rejected(bad):
    with pytest.raises((PydanticError, TypeError, ValueError)):
        generate.load(bad)


def test_load_service_unknown_returns_none_and_paths_are_refused():
    assert generate.load_service("nope") is None
    with pytest.raises(ValueError):
        generate.load_service("../schema/files/ecs")


def test_generation_survives_missing_optional_page_fields():
    raw = [{"id": "a", "kind": "base-select"}, {"id": "b", "kind": "base-stepper", "y": 5, "ranges": [{}]}]
    s = generate.build("x", raw, None)
    assert [c.id for c in s.controls] == ["a", "b"] and s.controls[1].after == ["a"]
    assert generate.load(generate.dump(s)) == s


def test_generation_keeps_a_hand_listed_mode_control_the_page_does_not_show():
    from autocalc.schema.model import Control
    old = ServiceSchema(service="x", controls=[Control(id="m", kind="k", option="o", modes=["ondemand"])])
    s = generate.build("x", [{"id": "a", "kind": "k"}], "1", old)
    assert {c.id for c in s.controls} == {"a", "m"}
    assert generate.diff(old, s)["removed"] == []


def test_stale_notes_name_each_outdated_schema_and_stay_quiet_when_current():
    live = generate.load_service("ecs").frontend
    assert generate.stale_notes(live) == [] and generate.stale_notes(None) == []
    notes = generate.stale_notes("0.0.1")
    assert len(notes) == len(FILES) and "autocalc schema diff" in notes[0]


def test_cli_coverage_reports_json_and_unknown_service_fails(capsys):
    assert cli.main(["schema", "coverage", "ecs"]) == 0
    assert json.loads(capsys.readouterr().out)["mapped_percent"] == 100
    assert cli.main(["schema", "coverage", "nope"]) == 1
    assert "No committed schema" in capsys.readouterr().out


def test_cli_diff_exits_nonzero_on_drift_and_writes_nothing(monkeypatch, capsys):
    path = generate.FILES / "ecs.yaml"
    before = path.read_bytes()
    fresh = generate.load_service("ecs")
    fresh.controls = fresh.controls[:-1]
    monkeypatch.setattr(generate, "pull", lambda svc: fresh)
    assert cli.main(["schema", "diff", "ecs"]) == 1
    assert json.loads(capsys.readouterr().out)["added"] == [] and path.read_bytes() == before


def test_cli_pull_writes_the_canonical_file(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(generate, "FILES", tmp_path)
    monkeypatch.setattr(generate, "pull", lambda svc: generate.build(svc, [{"id": "a", "kind": "k"}], "9"))
    assert cli.main(["schema", "pull", "demo"]) == 0
    assert yaml.safe_load((tmp_path / "demo.yaml").read_text(encoding="utf-8"))["frontend"] == "9"


def test_schema_files_are_packaged_data():
    out = subprocess.run([sys.executable, "-c", "import autocalc.schema.generate as g;print(len(list(g.FILES.glob('*.yaml'))))"],
                         capture_output=True, text=True, check=True)
    assert int(out.stdout) == len(FILES) and Path(generate.__file__).parent.name == "schema"
