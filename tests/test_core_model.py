from decimal import Decimal

import pytest

from autocalc.core import Candidate, Decision, Draft, Requirement
from autocalc.errors import ValidationError


def _draft() -> Draft:
    d = Draft("d-00000001", "acme", "huawei", [
        Requirement("a", "ecs", "sa-brazil-1", "monthly", 2, {"vcpus": 4, "memory_gb": 16}, az="az1"),
        Requirement("b", "ecs", "la-south-2", "ondemand", spec="c7n.large.2"),
    ])
    d.add_decision(Decision("a", "c7n.xlarge.4", "auto", "covers 4 vCPU/16 GB; exact match"))
    return d


def test_draft_round_trip_keeps_regions_az_and_decisions():
    d = _draft()
    back = Draft.from_dict(d.to_dict())
    assert back == d
    assert {r.region for r in back.requirements} == {"sa-brazil-1", "la-south-2"}
    assert back.requirements[0].az == "az1"
    assert back.pending() == ["b"]


def test_candidate_price_round_trips_exactly():
    c = Candidate("x", "r", "monthly", Decimal("0.1234567"), {"vcpus": 2.0})
    assert Candidate.from_dict(c.to_dict()) == c


@pytest.mark.parametrize("dec", [Decision("a", "s", "human", "  "), Decision("zzz", "s", "human", "why"),
                                 Decision("a", "s", "robot", "why")])
def test_bad_decisions_are_refused(dec):
    with pytest.raises(ValidationError):
        _draft().add_decision(dec)


def test_a_new_decision_replaces_the_old_one():
    d = _draft()
    d.add_decision(Decision("a", "other", "human", "size-up approved"))
    assert [x.spec for x in d.decisions if x.requirement_id == "a"] == ["other"]
