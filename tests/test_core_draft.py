from decimal import Decimal as D

import pytest

from autocalc.core import Candidate, DraftStore, Requirement, RunRecord, decide, draft_quote
from autocalc.errors import ValidationError


class Fake:
    name = "fake"

    def candidates(self, req):
        sizes = {"exact": [(4, 16, "50"), (4, 16, "60")], "bigger": [(4, 32, "70")]}[req.spec or req.id]
        return [Candidate(f"s{i}", req.region, req.billing, D(p), {"vcpus": v, "memory_gb": m})
                for i, (v, m, p) in enumerate(sizes)]


def reqs():
    n = {"vcpus": 4, "memory_gb": 16}
    return [Requirement("exact", "ecs", "sa-brazil-1", "monthly", needs=n),
            Requirement("bigger", "ecs", "la-south-2", "monthly", needs=n)]


def test_exact_is_auto_decided_inexact_stays_pending_and_human_decides(tmp_path):
    store = DraftStore(tmp_path)
    d = draft_quote(Fake(), "acme", reqs(), store)
    (auto,) = d.decisions
    assert (auto.requirement_id, auto.by) == ("exact", "auto")
    assert auto.justification == "covers 4 vCPU/16 GB; cheapest of 2 exact matches"
    assert d.pending() == ["bigger"]

    d2 = decide(store, d.id, "bigger", "s0", "customer approved +16 GB")
    assert d2.pending() == [] and d2.decisions[-1].by == "human"
    assert store.load(d.id) == d2

    kinds = [e["kind"] for e in RunRecord(tmp_path, d.id).read()]
    assert kinds.count("requirement") == 2 and kinds.count("candidates") == 2
    assert kinds.count("decision") == 2 and kinds.count("step") == 2


def test_decide_refuses_a_spec_that_was_not_a_candidate(tmp_path):
    store = DraftStore(tmp_path)
    d = draft_quote(Fake(), "acme", reqs(), store)
    with pytest.raises(ValidationError) as ei:
        decide(store, d.id, "bigger", "typo", "why")
    assert "s0" in str(ei.value.details)


def test_duplicate_requirement_ids_are_refused(tmp_path):
    with pytest.raises(ValidationError):
        draft_quote(Fake(), "acme", reqs() + reqs()[:1], DraftStore(tmp_path))
