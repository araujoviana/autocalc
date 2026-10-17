import pytest

from autocalc.core import RunRecord


def test_events_append_and_earlier_lines_do_not_change(tmp_path):
    r = RunRecord(tmp_path, "d-1")
    r.append("requirement", id="a")
    first = r.path.read_bytes()
    r.append("decision", by="human")
    assert r.path.read_bytes().startswith(first)
    events = r.read()
    assert [e["kind"] for e in events] == ["requirement", "decision"]
    assert all(e["t"].endswith("+00:00") for e in events)


def test_failing_step_is_still_timed(tmp_path):
    r = RunRecord(tmp_path, "d-1")
    with pytest.raises(RuntimeError), r.step("boom"):
        raise RuntimeError
    (e,) = r.read()
    assert e["kind"] == "step" and e["name"] == "boom" and e["ms"] >= 0


def test_missing_record_reads_empty(tmp_path):
    assert RunRecord(tmp_path, "d-none").read() == []
