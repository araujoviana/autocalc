/** Draft a quote and record decisions. */
import { Draft, invalid, type Decision, type Requirement } from "./model.ts";
import type { Provider } from "./provider.ts";
import { autoConfirmable, rank } from "./ranking.ts";
import { candidateToJSON } from "./model.ts";
import { RunRecord } from "./runs.ts";
import { DraftStore } from "./store.ts";

export const RECORDED_CANDIDATES = 20;

export async function draftQuote(provider: Provider, customer: string, requirements: Requirement[], store: DraftStore): Promise<Draft> {
  if (typeof customer !== "string" || !customer.trim()) throw invalid("customer must be a nonempty string.", "customer");
  if (!Array.isArray(requirements) || requirements.length === 0) throw invalid("A draft requires at least one requirement.", "requirements");
  const withAz = requirements.find(r => r.az !== null);
  if (withAz) throw invalid(`Availability-zone placement is not supported for ${withAz.service}.`, "az");
  const ids = requirements.map(r => r.id);
  if (new Set(ids).size !== ids.length) throw invalid("Requirement ids must be unique.", "id");
  const draft = new Draft(DraftStore.newId(), customer, provider.name, [...requirements]);
  const run = new RunRecord(store.root, draft.id);
  await run.append("draft", { draft_id: draft.id, customer, provider: provider.name });
  for (const req of requirements) {
    await run.append("requirement", { ...req });
    const ranked = rank(req, await run.step(`candidates:${req.id}`, () => provider.candidates(req)));
    await run.append("candidates", { requirement_id: req.id, total: ranked.length,
      candidates: ranked.map(r => ({ ...candidateToJSON(r.candidate), covers: r.covers, exact: r.exact, reason: r.reason })) });
    if (autoConfirmable(ranked)) {
      const decision: Decision = { requirement_id: req.id, spec: ranked[0]!.candidate.spec, by: "auto", justification: ranked[0]!.reason };
      draft.addDecision(decision);
      await run.append("decision", { ...decision });
    }
  }
  await store.save(draft);
  return draft;
}

export const decide = (store: DraftStore, draftId: string, requirementId: string, spec: string, justification: string, by = "human") =>
  decideMany(store, draftId, [{ requirement_id: requirementId, spec, justification }], by);

/** Validate the complete batch before persisting any decision. */
export async function decideMany(store: DraftStore, draftId: string, decisions: Record<string, string>[], by = "human"): Promise<Draft> {
  if (!Array.isArray(decisions) || decisions.length === 0) throw invalid("decisions must be a nonempty list.", "decisions");
  return store.lock(draftId, async () => {
    const draft = await store.load(draftId);
    if (draft.publication || draft.publishing) throw invalid("Published drafts cannot be revised. Create a new draft.", "draft_id");
    const run = new RunRecord(store.root, draft.id), events = await run.read();
    const ids = new Set<string>(), accepted: Decision[] = [];
    for (const item of decisions) {
      const keys = item && typeof item === "object" ? Object.keys(item).sort().join() : "";
      if (keys !== "justification,requirement_id,spec") throw invalid("Each decision needs requirement_id, spec and justification.", "decisions");
      const { requirement_id: requirementId, spec, justification } = item as { requirement_id: string; spec: string; justification: string };
      if (typeof requirementId !== "string" || typeof spec !== "string") throw invalid("Decision ids and specs must be strings.", "decisions");
      if (ids.has(requirementId)) throw invalid("A batch cannot repeat a requirement id.", "requirement_id");
      ids.add(requirementId);
      const seen = events.filter(e => e.kind === "candidates" && e.requirement_id === requirementId).flatMap(e => (e.candidates as { spec: string }[]).map(c => c.spec));
      if (!seen.includes(spec)) throw invalid(`'${spec}' was not among the candidates for '${requirementId}'.`, "spec", seen.slice(0, RECORDED_CANDIDATES));
      const decision: Decision = { requirement_id: requirementId, spec, by, justification };
      draft.addDecision(decision);
      accepted.push(decision);
    }
    await store.save(draft);
    for (const decision of accepted) await run.append("decision", { ...decision });
    return draft;
  });
}
