/** Draft → revise tools (ADR-0007). `publish_quote` joins in task 4.3. */
import { RegionResolver } from "./regions.ts";
import { formatDecimal } from "./quote/decimal.ts";
import { decideMany, draftQuote } from "./quote/draft.ts";
import { invalid, requirementFromJSON, type Draft } from "./quote/model.ts";
import { rank } from "./quote/ranking.ts";
import type { ActionContext } from "./types.ts";

const SHOWN = 5;

async function view(ctx: ActionContext, draft: Draft) {
  const decided = new Map(draft.decisions.map(d => [d.requirement_id, d]));
  const requirements = [];
  for (const r of draft.requirements) {
    const decision = decided.get(r.id) ?? null;
    requirements.push({ id: r.id, service: r.service, decision,
      ...(decision ? {} : { candidates: rank(r, await ctx.provider.candidates(r)).slice(0, SHOWN).map(x => ({ spec: x.candidate.spec, price: formatDecimal(x.candidate.price), reason: x.reason })) }) });
  }
  return { draft_id: draft.id, pending: draft.pending(), requirements };
}

export async function draftQuoteTool(ctx: ActionContext, input: { customer: string; requirements: unknown[] }) {
  if (!Array.isArray(input.requirements) || input.requirements.length === 0) throw invalid("requirements must be a nonempty list.", "requirements");
  // option names are not checked here yet: the schema-driven validator (task 4.3b) owns that
  const resolver = new RegionResolver(await ctx.catalog.regions());
  const reqs = input.requirements.map(raw => {
    if (raw && typeof raw === "object" && !Array.isArray(raw) && typeof (raw as { region?: unknown }).region === "string" && (raw as { region: string }).region)
      raw = { ...raw, region: resolver.resolve((raw as { region: string }).region) };
    return requirementFromJSON(raw);
  });
  return view(ctx, await draftQuote(ctx.provider, input.customer, reqs, ctx.drafts));
}

export async function reviseQuoteTool(ctx: ActionContext, input: { draft_id: string; decisions: Record<string, string>[] }) {
  const draft = await decideMany(ctx.drafts, input.draft_id, input.decisions);
  return { draft_id: input.draft_id, pending: draft.pending() };
}

export const listDraftsTool = (ctx: ActionContext) => ctx.drafts.list();
export const inspectDraftTool = (ctx: ActionContext, input: { draft_id: string }) => ctx.drafts.inspect(input.draft_id);
export const recoverDraftTool = (ctx: ActionContext, input: { draft_id: string; confirmed_no_remote_list: boolean; justification: string }) =>
  ctx.drafts.recover(input.draft_id, input.confirmed_no_remote_list, input.justification);
