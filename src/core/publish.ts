/** publish_quote (ADR-0007, ADR-0016): the only route from a decided draft to a verified share link.
 *
 * The builders say what to fill in (form state, never rated); the calculator page builds the card that is saved;
 * the gate (ADR-0003) saves it, checks it on the website's own terms and deletes it on any failure.
 */
import { availableParallelism, freemem } from "node:os";
import { CalculatorError } from "./errors.ts";
import { progress } from "./progress.ts";
import { invalid } from "./quote/model.ts";
import { CardInput } from "./schemas.ts";
import { buildRecipe, RECIPES } from "./services/forms.ts";
import { warnings as frontendWarnings } from "./frontend.ts";
import { modesOf, RECIPE_SPEC_FIELDS, SINGLE_QUANTITY, SPEC_ARG, specOption, VERIFIED } from "./services/publication.ts";
export { frontendWarnings };
import type { ActionContext } from "./types.ts";

type Dict = Record<string, any>;

/** What publishing needs from the outside world; tests substitute fakes (Python monkeypatches the same seams). */
export interface PublishPorts {
  /** The requested page state for one builder input, resolved against the catalog and never rated. */
  form(input: Dict): Promise<Dict>;
  /** The card the calculator page builds from that state. */
  encode(service: string, rewriteValue: Dict): Promise<Dict>;
  /** Save, verify on the website, or delete and throw GATE_FAILED. */
  publish(name: string, cards: Dict[], options: { settlement: "total" | "monthly"; currency: string }): Promise<Dict>;
  /** The frontend version the live calculator page loads, or undefined when it cannot be read. */
  liveVersion(): Promise<string | undefined>;
}

/** Conservative parallel browser budget (ADR-0010); an explicit override is checked on use. */
export function encodeWorkers(env: Record<string, string | undefined> = process.env, memory = freemem(), cpus = availableParallelism()): number {
  const override = env.AUTOCALC_ENCODE_WORKERS;
  if (override !== undefined) {
    const workers = /^\d+$/.test(override.trim()) ? Number(override) : 0;
    if (!(workers >= 1 && workers <= 16)) throw new CalculatorError("VALIDATION", "AUTOCALC_ENCODE_WORKERS must be an integer from 1 to 16.");
    return workers;
  }
  return Math.min(3, cpus, Math.max(1, Math.floor((memory - 512 * 1024 ** 2) / (768 * 1024 ** 2))));
}


async function mapLimit<T, R>(items: T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0, failure: unknown, failed = false;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !failed) {
      const index = next++;
      try { results[index] = await work(items[index]!, index); } catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }));
  if (failed) throw failure;
  return results;
}

/** The page-control values of the chosen catalog SKU, for recipe services whose controls are SKU fields (see RECIPE_SPEC_FIELDS). */
async function specOptions(ctx: ActionContext, service: string, region: string, spec: string): Promise<Dict> {
  const map = RECIPE_SPEC_FIELDS[service];
  if (!map) return {};
  const item = ((await ctx.catalog.productInfo(service, region)).product[map.group] ?? []).find(product => product.resourceSpecCode === spec);
  if (!item) throw invalid(`${spec} is not a ${service} SKU sold in ${region}.`, "spec");
  return Object.fromEntries(map.fields.map(field => (typeof field === "string" ? [field, field] : field) as [string, string]).filter(([, key]) => item[key] != null).map(([option, key]) => [option, item[key]]));
}

export function validateListName(name: unknown): void {
  if (typeof name !== "string" || !name.trim() || name.length > 50) throw invalid("List name must contain 1 to 50 characters.", "name");
}

export async function publishQuoteTool(ctx: ActionContext, input: { draft_id: string; name: string; settlement: "total" | "monthly"; currency: string }) {
  const ports = ctx.publish;
  if (!ports) throw new CalculatorError("BROWSER_UNAVAILABLE", "Publishing needs a browser; this context has none.");
  return ctx.drafts.lock(input.draft_id, async () => {
    const draft = await ctx.drafts.load(input.draft_id);
    if (draft.publication) return draft.publication;
    validateListName(input.name);
    if (draft.publishing) throw invalid("A previous publication has an unknown outcome. Use inspect_draft; check saved lists before recover_draft.", "draft_id");
    if (draft.requirements.some(r => r.az !== null)) throw invalid("Availability-zone selection is not supported yet.", "az");
    if (draft.pending().length) throw invalid(`Draft ${input.draft_id} still has undecided requirements.`, "requirement_id", draft.pending(), "Call revise_quote for each of them.");
    const unsupported = [...new Set(draft.requirements.map(r => r.service.toLowerCase()))].filter(service => !VERIFIED.has(service)).sort();
    if (unsupported.length) throw invalid(`publish_quote cannot build [${unsupported.map(service => `'${service}'`).join(", ")}] yet.`, "service", [...VERIFIED].sort());

    const spec = new Map(draft.decisions.map(d => [d.requirement_id, d.spec]));
    const builderInputs = await Promise.all(draft.requirements.map(async r => {
      const service = r.service.toLowerCase(), modes = modesOf(service);
      if (!modes.includes(r.billing)) throw invalid(`${r.service} does not support '${r.billing}'.`, "billing", modes);
      if (r.quantity !== 1 && SINGLE_QUANTITY.has(service)) throw invalid(`${r.service} cannot express quantity on its form.`, "quantity", [1]);
      const specArg = SPEC_ARG[service], chosen = specArg ? { [specArg]: specOption(service, spec.get(r.id)!) } : {};
      const duplicate = Object.keys(r.options).filter(key => key in chosen || ["region", "billing", "quantity"].includes(key)).sort();
      if (duplicate.length) throw invalid("Options duplicate requirement fields.", duplicate[0]);
      if (service in RECIPES) {
        const mapped = await specOptions(ctx, service, r.region, spec.get(r.id)!);
        buildRecipe(service, { region: r.region, billing: r.billing, quantity: r.quantity, ...mapped, ...r.options });
        return { service, region: r.region, billing: r.billing, quantity: r.quantity, ...mapped, ...r.options } as Dict;
      }
      const parsed = CardInput.safeParse({ service, region: r.region, billing: r.billing, ...(r.quantity === 1 ? {} : { quantity: r.quantity }), ...chosen, ...r.options });
      if (!parsed.success) throw invalid(`Invalid ${r.service} builder options: ${parsed.error.issues.map(issue => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ")}`, "options");
      return parsed.data as Dict;
    }));
    await ctx.lists.lists(); // fail now, not after minutes of encoding, when the profile is not signed in

    const forms = await Promise.all(builderInputs.map(async (card, index) => {
      const rewriteValue = await ports.form(card), r = draft.requirements[index]!;
      if (r.quantity !== 1 && !("global_QUANTITY" in rewriteValue)) throw invalid(`${r.service} did not encode the requested quantity.`, "quantity", [1]);
      return rewriteValue;
    }));
    // The builders say what to fill in; the page builds the card that is saved (ADR-0001). Each encode has its own browser context (ADR-0010).
    const cards: Dict[] = await mapLimit(draft.requirements, encodeWorkers(), async (r, index) => { progress(`Encoding ${r.id} in the calculator page (${index + 1}/${draft.requirements.length})`); return ports.encode(r.service.toLowerCase(), forms[index]!); });
    draft.requirements.forEach((r, index) => { cards[index]!.selectedProduct._customTitle = r.id; }); // the customer sees the requirement's name, not "custom.ecs 1"
    draft.requirements.forEach((r, index) => {
      if (SPEC_ARG[r.service.toLowerCase()]) return;
      const actual = new Set((cards[index]!.selectedProduct.productAllInfos ?? []).map((product: Dict) => product.resourceSpecCode));
      if (!actual.has(spec.get(r.id))) throw invalid(`Encoded ${r.service} card does not contain the selected spec '${spec.get(r.id)}'.`, "spec");
    });

    draft.publishing = true;
    await ctx.drafts.save(draft); // a crash or ambiguous upstream response must never trigger an automatic duplicate
    const out = await ports.publish(input.name, cards, { settlement: input.settlement, currency: input.currency.toUpperCase() });
    let result: Dict = { draft_id: input.draft_id, id: out.id, url: out.url, checks: out.checks };
    draft.publication = result; draft.publishing = false;
    await ctx.drafts.save(draft); // persist the verified remote result before optional metadata work
    await ctx.drafts.link(out.id, input.draft_id);
    const notes = frontendWarnings(draft.requirements.map(r => r.service.toLowerCase()), await ports.liveVersion());
    if (notes.length) { result = { ...result, warnings: notes }; draft.publication = result; await ctx.drafts.save(draft); }
    return result;
  });
}
