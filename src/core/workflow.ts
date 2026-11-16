/** Draft → revise tools (ADR-0007). `publish_quote` joins in task 4.3. */
import { RegionResolver } from "./regions.ts";
import { formatDecimal } from "./quote/decimal.ts";
import { decideMany, draftQuote } from "./quote/draft.ts";
import { invalid, requirementFromJSON, type Draft } from "./quote/model.ts";
import { rank } from "./quote/ranking.ts";
import { legalOptions } from "./services/publication.ts";
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
  const resolver = new RegionResolver(await ctx.catalog.regions());
  const reqs = input.requirements.map((raw, index) => {
    if (raw && typeof raw === "object" && !Array.isArray(raw) && typeof (raw as { region?: unknown }).region === "string" && (raw as { region: string }).region)
      raw = { ...raw, region: resolver.resolve((raw as { region: string }).region) };
    try { return requirementFromJSON(raw); }
    catch (err) {
      if (err instanceof Error && "code" in err) throw invalid(`Requirement [${index}]: ${err.message}`, "requirements");
      throw err;
    }
  });
  for (const r of reqs) {
    const allowed = legalOptions(r.service), unknown = Object.keys(r.options).filter(name => allowed && !allowed.includes(name) && name !== "periods" && name !== "hours").sort(); // periods/hours: the billing term, checked by the builder schema
    if (unknown.length) throw invalid(`${r.service} has no option '${unknown[0]}'.`, unknown[0], allowed!, `Read autocalc://schema/${r.service} for legal options and ranges.`);
  }
  return view(ctx, await draftQuote(ctx.provider, input.customer, reqs, ctx.drafts));
}

export async function reviseQuoteTool(ctx: ActionContext, input: { draft_id: string; decisions: Record<string, string>[] }) {
  const draft = await decideMany(ctx.drafts, input.draft_id, input.decisions);
  return { draft_id: input.draft_id, pending: draft.pending() };
}

export const listDraftsTool = (ctx: ActionContext) => ctx.drafts.list();
export async function inspectDraftTool(ctx: ActionContext, input: { draft_id?: string | undefined; limit?: number | undefined }) {
  if (input.draft_id) return ctx.drafts.inspect(input.draft_id);
  const all = await ctx.drafts.list();
  const limit = input.limit ?? 20;
  return { total: all.length, drafts: all.slice(0, limit) };
}
export const recoverDraftTool = (ctx: ActionContext, input: { draft_id: string; confirmed_no_remote_list: boolean; justification: string }) =>
  ctx.drafts.recover(input.draft_id, input.confirmed_no_remote_list, input.justification);
