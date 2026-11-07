import type { BrowserManager } from "../../../src/core/browser.ts";
import { encodeCard } from "../../../src/core/page/encode.ts";
import { CardInput } from "../../../src/core/schemas.ts";
import { RECIPES, buildRecipe } from "../../../src/core/services/forms.ts";
import { buildCard } from "../../../src/core/services/index.ts";
import { diffProducts, type Diff } from "./harness.ts";

export interface Scenario { name: string; input: Record<string, unknown>; region?: string }
export interface Result { name: string; ok: boolean; stage: "schema" | "build" | "page" | "diff" | "ok"; message?: string; diff?: Diff[] }
export type Catalog = { product: Record<string, Record<string, unknown>[]> };

// Prices are not compared here (the page prices the card), so rating is stubbed.
const context = (catalog: Catalog) => ({
  productInfo: async () => catalog,
  rate: async (body: any) => ({ productRatingResult: body.productInfos.map(({ id }: any) => ({ id, amount: 0, originalAmount: 0 })) }),
}) as any;

const BUILDERS = new Set(CardInput.options.map(option => option.shape.service.value as string));
/** Recipe services have no builder products: the form state is the card, so the check is that the page accepts and holds it. */
async function runRecipe(manager: BrowserManager, service: string, region: string, scenario: Scenario): Promise<Result> {
  let form: Record<string, any>;
  try { form = buildRecipe(service, { region, ...scenario.input }).rewriteValue; }
  catch (e: any) { return { name: scenario.name, ok: false, stage: "build", message: String(e?.message ?? e).slice(0, 300) }; }
  try { await encodeCard(manager, service, form, { timeout: 25 }); return { name: scenario.name, ok: true, stage: "ok" }; }
  catch (e: any) { return { name: scenario.name, ok: false, stage: "page", message: `${String(e?.message ?? e).slice(0, 260)}${e?.details?.field ? ` [${e.details.field}]` : ""}` }; }
}

export async function runScenario(manager: BrowserManager, service: string, region: string, catalog: Catalog, scenario: Scenario): Promise<Result> {
  if (service in RECIPES && !BUILDERS.has(service)) return runRecipe(manager, service, region, scenario);
  const parsed = CardInput.safeParse({ service, region, ...scenario.input });
  if (!parsed.success) return { name: scenario.name, ok: false, stage: "schema", message: parsed.error.issues.map(i => i.message).join("; ") };
  let built: any;
  try { built = await buildCard(parsed.data, context(catalog)); }
  catch (e: any) { return { name: scenario.name, ok: false, stage: "build", message: String(e?.message ?? e).slice(0, 300) }; }
  let page: any;
  try { page = await encodeCard(manager, service, built.rewriteValue, { timeout: 25 }); }
  catch (e: any) { return { name: scenario.name, ok: false, stage: "page", message: `${String(e?.message ?? e).slice(0, 260)}${e?.details?.field ? ` [${e.details.field}]` : ""}` }; }
  const diff = diffProducts(built.selectedProduct.productAllInfos, page.selectedProduct.productAllInfos);
  return diff.length ? { name: scenario.name, ok: false, stage: "diff", diff } : { name: scenario.name, ok: true, stage: "ok" };
}
