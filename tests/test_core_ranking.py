from decimal import Decimal as D

from autocalc.core import Candidate, Requirement, auto_confirmable, rank

REQ = Requirement("r", "ecs", "sa-brazil-1", "monthly", needs={"vcpus": 4, "memory_gb": 16})


def cand(spec, vcpus, mem, price, gen=0):
    return Candidate(spec, "sa-brazil-1", "monthly", D(price), {"vcpus": vcpus, "memory_gb": mem}, gen)


def test_covering_beats_cheaper_and_non_covering_is_last():
    r = rank(REQ, [cand("small", 2, 8, "10"), cand("big", 8, 32, "80")])
    assert [x.candidate.spec for x in r] == ["big", "small"]
    assert [x.covers for x in r] == [True, False]
    assert r[1].reason == "misses 4 vCPU (has 2), 16 GB (has 8)"


def test_ties_fall_through_to_price_then_generation():
    r = rank(REQ, [cand("old", 4, 16, "50", 6), cand("new", 4, 16, "50", 7), cand("cheap", 4, 16, "40", 5)])
    assert [x.candidate.spec for x in r] == ["cheap", "new", "old"]


def test_cheapest_of_three_exact_matches_reason():
    r = rank(REQ, [cand("a", 4, 16, "60"), cand("b", 4, 16, "50"), cand("c", 4, 16, "70")])
    assert r[0].reason == "covers 4 vCPU/16 GB; cheapest of 3 exact matches"
    assert r[1].reason == "exact match; 10 above the cheapest exact match"
    assert auto_confirmable(r)


def test_size_up_is_not_exact_and_says_by_how_much():
    r = rank(REQ, [cand("up", 4, 32, "70"), cand("up2", 8, 32, "90")])
    assert not auto_confirmable(r)
    assert r[0].reason == "covers 4 vCPU/16 GB with +16 GB; closest of 2 covering"
    assert r[1].reason == "covers 4 vCPU/16 GB with +4 vCPU, +16 GB"


def test_named_spec_makes_exact_and_missing_spec_blocks_auto():
    pinned = Requirement("r", "ecs", "x", "monthly", needs=REQ.needs, spec="named")
    r = rank(pinned, [cand("other", 4, 16, "40"), cand("named", 4, 16, "50")])
    assert r[0].candidate.spec == "named" and auto_confirmable(r)
    assert not auto_confirmable(rank(pinned, [cand("other", 4, 16, "40")]))


def test_nothing_requested_is_never_exact():
    assert not auto_confirmable(rank(Requirement("r", "ecs", "x", "monthly"), [cand("a", 1, 1, "1")]))


def test_empty_candidates():
    assert rank(REQ, []) == [] and not auto_confirmable([])
