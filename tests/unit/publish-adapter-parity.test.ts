import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inFormOnlyMode } from "../../src/core/cards.ts";
import { publishQuoteTool } from "../../src/core/publish.ts";
import { Draft, requirement } from "../../src/core/quote/model.ts";
import { DraftStore } from "../../src/core/quote/store.ts";
import { buildCard } from "../../src/core/services/index.ts";
import { buildRecipe, RECIPES } from "../../src/core/services/forms.ts";
import type { ActionContext } from "../../src/core/types.ts";
import { createSyntheticBusinessCatalog } from "../support/business-catalog.ts";

type Dict = Record<string, any>;

async function setup(service: "cce" | "sfs", injectUnknownField = false) {
  const directory = await mkdtemp(join(tmpdir(), "autocalc-adapter-parity-"));
  const drafts = new DraftStore(directory);
  const { catalog } = createSyntheticBusinessCatalog();
  const spec = service === "cce" ? "cce.s2.small" : "SFS_SATA";
  const billing = service === "cce" ? "monthly" : "ondemand";
  const draft = new Draft(DraftStore.newId(), "Synthetic adapter test", "huawei", [requirement({
    id: "resource", service, region: "sa-brazil-1", billing, spec,
    options: service === "cce" ? { cluster_type: "standard", ha: true, scale: "small" } : { capacity_gb: 1000 },
  })]);
  draft.addDecision({ requirement_id: "resource", spec, by: "human", justification: "Literal synthetic fixture specification" });
  await drafts.save(draft);
  const built = new WeakMap<object, Dict>();
  const published: Dict[][] = [];
  const ctx = {
    drafts, catalog, lists: { lists: async () => [] },
    publish: {
      // Same real strict form-building branches as createCore. Only the slow
      // browser/save boundaries are doubled; unknown fields are never stripped.
      form: async (input: Dict) => {
        const supplied = injectUnknownField ? { ...input, _plannedSpec: spec } : input;
        if (String(supplied.service) in RECIPES) {
          const form = buildRecipe(String(supplied.service), supplied as never).rewriteValue;
          built.set(form, { rewriteValue: form, selectedProduct: { serviceCode: service, productAllInfos: [{ resourceSpecCode: spec }] } });
          return form;
        }
        const card = await inFormOnlyMode(() => buildCard(supplied as never, {
          productInfo: (name, region) => catalog.productInfo(name, region),
          rate: async () => { throw new Error("Form-only publication must not rate"); },
        }));
        built.set(card.rewriteValue, card);
        return card.rewriteValue;
      },
      encode: async (_service: string, form: object) => {
        const card = built.get(form);
        if (!card) throw new Error("Publisher did not call the real form adapter");
        return structuredClone(card);
      },
      publish: async (_name: string, cards: Dict[]) => {
        published.push(cards);
        return { id: "synthetic-list", url: "https://example.invalid/synthetic-list", checks: [] };
      },
      liveVersion: async () => "11.4.201",
    },
  } as unknown as ActionContext;
  return { ctx, id: draft.id, published, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

for (const service of ["cce", "sfs"] as const) {
  test(`publisher inputs are accepted by the real strict ${service} form adapter`, async () => {
    const { ctx, id, published, cleanup } = await setup(service);
    try {
      await publishQuoteTool(ctx, { draft_id: id, name: "Synthetic", settlement: "total", currency: "USD" });
      expect(published).toHaveLength(1);
      expect(published[0]).toHaveLength(1);
      expect(published[0]![0]!.selectedProduct._customTitle).toBe("resource");
      expect(published[0]![0]!.rewriteValue.global_REGIONINFO.region).toBe("sa-brazil-1");
    } finally { await cleanup(); }
  });

  test(`unknown test metadata fails before any ${service} list is saved`, async () => {
    const { ctx, id, published, cleanup } = await setup(service, true);
    try {
      await expect(publishQuoteTool(ctx, { draft_id: id, name: "Synthetic", settlement: "total", currency: "USD" })).rejects.toMatchObject({ code: "VALIDATION" });
      expect(published).toHaveLength(0);
      expect((await ctx.drafts.load(id)).publishing).toBe(false);
    } finally { await cleanup(); }
  });
}
