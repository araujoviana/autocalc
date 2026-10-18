"""Frontend-version warnings: same, different and unknown versions."""

from autocalc import frontend
from autocalc.services import VERIFIED


def test_same_version_is_quiet():
    v = VERIFIED["ecs"]
    assert frontend.warnings(["ecs"], v) == []


def test_different_version_names_service_and_both_versions():
    [note] = frontend.warnings(["ecs", "ecs"], "99.0.0")
    assert "ecs" in note and VERIFIED["ecs"] in note and "99.0.0" in note


def test_unknown_live_version_warns_once():
    assert len(frontend.warnings(["ecs", "evs"], None)) == 1
