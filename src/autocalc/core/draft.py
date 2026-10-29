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
    if not isinstance(customer, str) or not customer.strip():
        raise ValidationError("customer must be a nonempty string.", field="customer")
    if not isinstance(requirements, list) or not requirements:
        raise ValidationError("A draft requires at least one requirement.", field="requirements")
    if any(r.az is not None for r in requirements):
        raise ValidationError("Availability-zone selection is not supported yet.", field="az")
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
                               for r in ranked])
        if auto_confirmable(ranked):
            decision = Decision(req.id, ranked[0].candidate.spec, "auto", ranked[0].reason)
            draft.add_decision(decision)
            run.append("decision", **decision.to_dict())
    store.save(draft)
    return draft


def decide(store: DraftStore, draft_id: str, requirement_id: str, spec: str, justification: str,
           by: str = "human") -> Draft:
    return decide_many(store, draft_id, [{"requirement_id": requirement_id, "spec": spec,
                                         "justification": justification}], by)


def decide_many(store: DraftStore, draft_id: str, decisions: list[dict[str, str]], by: str = "human") -> Draft:
    """Validate the complete batch before persisting any decision."""
    if not isinstance(decisions, list) or not decisions:
        raise ValidationError("decisions must be a nonempty list.", field="decisions")
    with store.lock(draft_id):
        draft = store.load(draft_id)
        if draft.publication or draft.publishing:
            raise ValidationError("Published drafts cannot be revised. Create a new draft.", field="draft_id")
        run = RunRecord(store.root, draft.id)
        events = run.read()
        ids = set()
        accepted = []
        for item in decisions:
            if not isinstance(item, dict) or set(item) != {"requirement_id", "spec", "justification"}:
                raise ValidationError("Each decision needs requirement_id, spec and justification.", field="decisions")
            requirement_id, spec = item["requirement_id"], item["spec"]
            if not isinstance(requirement_id, str) or not isinstance(spec, str):
                raise ValidationError("Decision ids and specs must be strings.", field="decisions")
            if requirement_id in ids:
                raise ValidationError("A batch cannot repeat a requirement id.", field="requirement_id")
            ids.add(requirement_id)
            seen = [c["spec"] for e in events if e["kind"] == "candidates" and e["requirement_id"] == requirement_id
                    for c in e["candidates"]]
            if spec not in seen:
                raise ValidationError(f"{spec!r} was not among the candidates for {requirement_id!r}.",
                                      field="spec", allowed=seen[:RECORDED_CANDIDATES])
            decision = Decision(requirement_id, spec, by, item["justification"])
            draft.add_decision(decision)
            accepted.append(decision)
        store.save(draft)
        for decision in accepted:
            run.append("decision", **decision.to_dict())
        return draft
