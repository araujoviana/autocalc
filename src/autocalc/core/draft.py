"""Draft a quote and record decisions. Plain functions so the tool registry can wrap them later."""

from __future__ import annotations

from autocalc.core.model import Decision, Draft, Requirement
from autocalc.core.provider import Provider
from autocalc.core.ranking import auto_confirmable, rank
from autocalc.core.runs import RunRecord
from autocalc.core.store import DraftStore
from autocalc.errors import ValidationError

RECORDED_CANDIDATES = 20


def draft_quote(provider: Provider, customer: str, requirements: list[Requirement], store: DraftStore) -> Draft:
    ids = [r.id for r in requirements]
    if len(set(ids)) != len(ids):
        raise ValidationError("Requirement ids must be unique.", field="id")
    draft = Draft(id=store.new_id(), customer=customer, provider=provider.name, requirements=list(requirements))
    run = RunRecord(store.root, draft.id)
    run.append("draft", draft_id=draft.id, customer=customer, provider=provider.name)
    for req in requirements:
        run.append("requirement", **req.to_dict())
        with run.step(f"candidates:{req.id}"):
            ranked = rank(req, provider.candidates(req))
        run.append("candidates", requirement_id=req.id, total=len(ranked),
                   candidates=[{**r.candidate.to_dict(), "covers": r.covers, "exact": r.exact, "reason": r.reason}
                               for r in ranked[:RECORDED_CANDIDATES]])
        if auto_confirmable(ranked):
            decision = Decision(req.id, ranked[0].candidate.spec, "auto", ranked[0].reason)
            draft.add_decision(decision)
            run.append("decision", **decision.to_dict())
    store.save(draft)
    return draft


def decide(store: DraftStore, draft_id: str, requirement_id: str, spec: str, justification: str,
           by: str = "human") -> Draft:
    draft = store.load(draft_id)
    run = RunRecord(store.root, draft.id)
    seen = [c["spec"] for e in run.read() if e["kind"] == "candidates" and e["requirement_id"] == requirement_id
            for c in e["candidates"]]
    if seen and spec not in seen:
        raise ValidationError(f"{spec!r} was not among the candidates for {requirement_id!r}.",
                              field="spec", allowed=seen[:RECORDED_CANDIDATES])
    decision = Decision(requirement_id, spec, by, justification)
    draft.add_decision(decision)
    run.append("decision", **decision.to_dict())
    store.save(draft)
    return draft
