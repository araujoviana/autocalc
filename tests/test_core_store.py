import pytest

from autocalc.core import Decision, Draft, DraftStore, Requirement, RunRecord
from autocalc.errors import ValidationError


def _draft(store, cust="acme"):
    d = Draft(store.new_id(), cust, "huawei", [Requirement("a", "ecs", "sa-brazil-1", "monthly")])
    d.add_decision(Decision("a", "s", "human", "why"))
    return d


def test_round_trip_and_no_tmp_left(tmp_path):
    s = DraftStore(tmp_path)
    d = _draft(s)
    s.save(d)
    s.save(d)
    assert s.load(d.id) == d
    assert [p.name for p in s.dir.iterdir()] == [f"{d.id}.json"]


def test_unknown_and_malformed_ids_name_the_id(tmp_path):
    for bad in ("d-deadbeef", "../etc/passwd"):
        with pytest.raises(ValidationError, match="No draft"):
            DraftStore(tmp_path).load(bad)


def test_list_newest_first(tmp_path):
    import os
    s = DraftStore(tmp_path)
    a, b = _draft(s, "first"), _draft(s, "second")
    s.save(a)
    s.save(b)
    os.utime(s.dir / f"{a.id}.json", (1, 1))
    assert [x["customer"] for x in s.list()] == ["second", "first"]
    assert DraftStore(tmp_path / "empty").list() == []


def test_default_root_follows_autocalc_data(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOCALC_DATA", str(tmp_path))
    s = DraftStore()
    d = _draft(s)
    s.save(d)
    RunRecord(s.root, d.id).append("x")
    assert (tmp_path / "drafts" / f"{d.id}.json").exists() and (tmp_path / "runs" / f"{d.id}.jsonl").exists()
