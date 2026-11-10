import type { BrowserManager } from "../../../src/core/browser.ts";
import { encodeCard } from "../../../src/core/page/encode.ts";
import { CardInput } from "../../../src/core/schemas.ts";
import { RECIPES, buildRecipe } from "../../../src/core/services/forms.ts";
import { buildCard } from "../../../src/core/services/index.ts";
import { diffProducts, type Diff } from "./harness.ts";

export interface Scenario {
  name: string;
  input: Record<string, unknown>;
  region?: string;
}

export interface Result {
  name: string;
  ok: boolean;
  stage: "schema" | "build" | "page" | "diff" | "ok" | "blocked";
  effectiveRegion?: string | undefined;
  message?: string | undefined;
  diff?: Diff[] | undefined;
  blocker?: string | undefined;
}

export type Catalog = { product: Record<string, Record<string, unknown>[]> };

// Prices are not compared here (the page prices the card), so rating is stubbed.
const context = (catalog: Catalog) =>
  ({
    productInfo: async () => catalog,
    rate: async (body: any) => ({
      productRatingResult: body.productInfos.map(({ id }: any) => ({
        id,
        amount: 0,
        originalAmount: 0,
      })),
    }),
  }) as any;

const BUILDERS = new Set(
  CardInput.options.map((option) => option.shape.service.value as string)
);

function isConnectionReset(msg: string): boolean {
  return (
    msg.includes("ECONNRESET") ||
    msg.includes("connection reset") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("socket hang up") ||
    msg.includes("fetch failed")
  );
}

/** Recipe services have no builder products: the form state is the card, so the check is that the page accepts and holds it. */
async function runRecipe(
  manager: BrowserManager,
  service: string,
  region: string,
  scenario: Scenario
): Promise<Result> {
  let form: Record<string, any>;
  try {
    form = buildRecipe(service, { region, ...scenario.input }).rewriteValue;
  } catch (e: any) {
    return {
      name: scenario.name,
      ok: false,
      stage: "build",
      effectiveRegion: region,
      message: String(e?.message ?? e).slice(0, 300),
    };
  }
  try {
    await encodeCard(manager, service, form, { timeout: 25 });
    return { name: scenario.name, ok: true, stage: "ok", effectiveRegion: region };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const blocked = isConnectionReset(msg);
    return {
      name: scenario.name,
      ok: false,
      stage: blocked ? "blocked" : "page",
      effectiveRegion: region,
      message: `${msg.slice(0, 260)}${e?.details?.field ? ` [${e.details.field}]` : ""}`,
      blocker: blocked ? msg : undefined,
    };
  }
}

export async function runScenario(
  manager: BrowserManager,
  service: string,
  region: string,
  catalog: Catalog,
  scenario: Scenario
): Promise<Result> {
  const effectiveRegion = scenario.region ?? region;
  if (service in RECIPES && !BUILDERS.has(service)) {
    return runRecipe(manager, service, effectiveRegion, scenario);
  }
  const parsed = CardInput.safeParse({
    service,
    region: effectiveRegion,
    ...scenario.input,
  });
  if (!parsed.success) {
    return {
      name: scenario.name,
      ok: false,
      stage: "schema",
      effectiveRegion,
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  let built: any;
  try {
    built = await buildCard(parsed.data, context(catalog));
  } catch (e: any) {
    return {
      name: scenario.name,
      ok: false,
      stage: "build",
      effectiveRegion,
      message: String(e?.message ?? e).slice(0, 300),
    };
  }
  let page: any;
  try {
    page = await encodeCard(manager, service, built.rewriteValue, { timeout: 25 });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const blocked = isConnectionReset(msg);
    return {
      name: scenario.name,
      ok: false,
      stage: blocked ? "blocked" : "page",
      effectiveRegion,
      message: `${msg.slice(0, 260)}${e?.details?.field ? ` [${e.details.field}]` : ""}`,
      blocker: blocked ? msg : undefined,
    };
  }
  const diff = diffProducts(
    built.selectedProduct.productAllInfos,
    page.selectedProduct.productAllInfos
  );
  return diff.length
    ? { name: scenario.name, ok: false, stage: "diff", effectiveRegion, diff }
    : { name: scenario.name, ok: true, stage: "ok", effectiveRegion };
}
