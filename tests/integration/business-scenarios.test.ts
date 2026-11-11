import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { Catalog } from "../../src/core/catalog.ts";
import { createSyntheticBusinessCatalog, type SyntheticBusinessReader } from "../support/business-catalog.ts";
import { HuaweiProvider } from "../../src/providers/huawei.ts";
import { checkAvailability } from "../../src/core/availability.ts";
import { DraftStore } from "../../src/core/quote/store.ts";
import { inFormOnlyMode } from "../../src/core/cards.ts";
import { buildRecipe, RECIPES } from "../../src/core/services/forms.ts";
import { buildCard as buildServiceCard } from "../../src/core/services/index.ts";
import { SPEC_ARG, specOption, USAGE_PRICED, VERIFIED } from "../../src/core/services/publication.ts";
import { apply, parse, plan, validate } from "../../src/core/quote-file.ts";
import { CalculatorError } from "../../src/core/errors.ts";
import type { ActionContext } from "../../src/core/types.ts";

const SCENARIOS_DIR = join(import.meta.dir, "..", "fixtures", "scenarios");

describe("20 Real-World Business Architecture YAML Scenarios", () => {
  let transport: SyntheticBusinessReader;
  let catalog: Catalog;
  let provider: HuaweiProvider;
  let draftDir: string;
  let ctx: ActionContext;
  let currentQuoteCards: Array<Record<string, any>> = [];
  let expectedCardSpecs = new Map<string, string>();
  let scenarioFiles: string[] = [];

  beforeAll(async () => {
    draftDir = mkdtempSync(join(tmpdir(), "autocalc-scenarios-"));
    const synthetic = createSyntheticBusinessCatalog();
    transport = synthetic.transport;
    catalog = synthetic.catalog;
    provider = new HuaweiProvider({
      skus: (service, region) => catalog.skus(service, region),
      checkMode: async (service, region, billing) =>
        checkAvailability(await catalog.menu(), service, region, billing as "ondemand" | "monthly" | "yearly"),
    });

    const drafts = new DraftStore(draftDir);

    ctx = {
      provider,
      drafts,
      reader: transport,
      catalog,
      rating: async () => ({ amount: 0, originalAmount: 0, discountAmount: 0, productRatingResult: [] }),
      lists: {
        lists: async () => [],
      } as any,
      auth: {} as any,
      publish: {
        form: async (input) => {
          const formResult =
            String(input.service) in RECIPES
              ? buildRecipe(String(input.service), input as never).rewriteValue
              : ((
                  await inFormOnlyMode(() =>
                    buildServiceCard(input as never, {
                      productInfo: (service, region) => catalog.productInfo(service, region),
                      rate: async () => {
                        throw new CalculatorError("AUTOCALC", "A form-only build must not rate.");
                      },
                    })
                  )
                ).rewriteValue as Record<string, unknown>);

          // Correlate with input card identity deterministically without queues
          const matchedCard = currentQuoteCards.find(
            (c) =>
              c.service.toLowerCase() === String(input.service).toLowerCase() &&
              c.region === input.region &&
              c.billing === (input.billing ?? "monthly")
          );
          (formResult as any)._inputCard = input;
          (formResult as any)._cardId = matchedCard?.id ?? "card";
          return formResult;
        },
        // Faithful per-resource encode double: asserts exact card identity, region, and expected spec
        encode: async (service, rewriteValue) => {
          expect(rewriteValue).toBeDefined();
          expect(typeof rewriteValue).toBe("object");

          const inputCard = (rewriteValue as any)._inputCard ?? {};
          const cardId = (rewriteValue as any)._cardId ?? "unknown";

          // Assert expected region and billing mode encoded in form
          if (rewriteValue.global_REGIONINFO) {
            const regInfo = rewriteValue.global_REGIONINFO as Record<string, any>;
            if (inputCard.region && regInfo.region) {
              expect(regInfo.region).toBe(inputCard.region);
            }
          }

          const cardSpec = expectedCardSpecs.get(cardId);
          expect(cardSpec, `Expected planned spec for card ${cardId}`).toBeDefined();

          return {
            selectedProduct: {
              serviceCode: service,
              _customTitle: cardId,
              rewriteValue,
              productAllInfos: [
                {
                  resourceSpecCode: cardSpec,
                  regionId: inputCard.region,
                  billingMode: inputCard.billing?.toUpperCase(),
                  productNum: inputCard.quantity ?? 1,
                },
              ],
            },
          };
        },
        // Offline orchestration double; does not certify live vendor publish/price correctness
        publish: async (name, cards, options) => {
          expect(cards.length).toBeGreaterThan(0);
          const checks = cards.map((card, index) => {
            const sp = card.selectedProduct as Record<string, any>;
            expect(sp).toBeDefined();
            expect(sp.serviceCode).toBeDefined();
            expect(Array.isArray(sp.productAllInfos)).toBe(true);
            expect(sp.productAllInfos.length).toBeGreaterThan(0);
            for (const prod of sp.productAllInfos) {
              expect(prod.resourceSpecCode).toBeDefined();
              expect(prod.resourceSpecCode).not.toBe("unknown-spec");
            }
            return {
              index,
              title: sp._customTitle || `card-${index}`,
              ok: true,
            };
          });
          return {
            id: `mock-list-${name}`,
            url: `https://www.huaweicloud.com/intl/en-us/pricing/calculator.html#/share/${name}`,
            checks,
            settlement: options.settlement,
          };
        },
        liveVersion: async () => undefined,
      },
    };

    const entries = await readdir(SCENARIOS_DIR);
    scenarioFiles = entries.filter((f) => f.endsWith(".yaml") && !f.endsWith(".lock.yaml")).sort();
  });

  afterAll(async () => {
    await transport.close();
    await rm(draftDir, { recursive: true, force: true });
  });

  it("includes exactly 20 business scenario YAML files covering all 40 verified Huawei Cloud services", async () => {
    expect(scenarioFiles.length).toBe(20);
    const coveredServices = new Set<string>();
    for (const file of scenarioFiles) {
      const yamlText = await readFile(join(SCENARIOS_DIR, file), "utf8");
      const quote = parse(yamlText);
      for (const card of quote.cards) {
        coveredServices.add(String(card.service).toLowerCase());
      }
    }
    const publishableServices = [...VERIFIED].filter((s) => s !== "ssa");
    expect(publishableServices.length).toBe(40);
    const missing = publishableServices.filter((s) => !coveredServices.has(s)).sort();
    expect(missing).toEqual([]);
  });

  it("validates, plans, and builds form cards for all 20 business scenarios with zero pending items or errors", async () => {
    for (const file of scenarioFiles) {
      const yamlText = await readFile(join(SCENARIOS_DIR, file), "utf8");
      const quote = parse(yamlText);
      expect(quote.version).toBe("1");
      expect(quote.cards.length).toBeGreaterThanOrEqual(7);

      const validationErrors = await validate(quote);
      if (validationErrors.length > 0) {
        throw new Error(`Scenario ${file} failed validate(): ${JSON.stringify(validationErrors, null, 2)}`);
      }
      expect(validationErrors).toEqual([]);

      const planned = await plan(ctx, quote);
      if (planned.pending.length > 0) {
        const pendingDetails = planned.cards.filter((c) => !c.spec);
        throw new Error(`Scenario ${file} had pending cards: ${JSON.stringify(pendingDetails, null, 2)}`);
      }
      expect(planned.pending).toEqual([]);

      for (const row of planned.cards) {
        const card = quote.cards.find((c) => c.id === row.id)!;
        expect(row.spec, `${file} -> ${row.id} missing spec`).toBeDefined();
        expect(row.unmapped_options, `${file} -> ${row.id} unmapped_options`).toEqual([]);
        expect(row.spec_problem, `${file} -> ${row.id} spec_problem`).toBeUndefined();
        expect(row.image_choices, `${file} -> ${row.id} image_choices`).toBeUndefined();
        if (USAGE_PRICED.has(card.service)) {
          expect(row.price_note).toBeDefined();
        } else if (card.service === "eip" && row.spec === "12_bgp") {
          expect(Number(row.price)).toBe(0);
        } else {
          expect(Number(row.price), `${file} -> ${row.id} price`).toBeGreaterThan(0);
        }

        // Verify form builder succeeds for every card using production specOption
        const specArg = SPEC_ARG[card.service];
        const chosen = specArg ? { [specArg]: specOption(card.service, String(row.spec)) } : {};
        const formInput = {
          service: card.service,
          region: card.region,
          billing: card.billing,
          ...(card.quantity && card.quantity !== 1 ? { quantity: card.quantity } : {}),
          ...chosen,
          ...card.options,
        };
        let rewriteValue: Record<string, unknown>;
        try {
          rewriteValue = (await ctx.publish!.form(formInput)) as Record<string, unknown>;
        } catch (error) {
          throw new Error(`Scenario ${file} card ${row.id} (${card.service}) failed form(): ${error instanceof Error ? error.message : String(error)}`);
        }
        expect(rewriteValue, `${file} -> ${row.id} form output`).toBeDefined();
      }

      currentQuoteCards = quote.cards;
      expectedCardSpecs = new Map(planned.cards.map((r) => [r.id, String(r.spec)]));
      const applied = await apply(ctx, quote);
      expect(applied.id).toContain("mock-list-");
    }
  }, 60000);

  it("validates and plans existing compiler unit-test YAML examples end-to-end", async () => {
    const pipelineYaml = `
version: "1"
metadata:
  id: qitech-fintech-quote
  customer: Acme FinTech
  title_prefix: "Acme - Prod"
  currency: USD
horizon:
  duration: 1y
  billing_policy: as-specified
defaults:
  provider: huawei
  region: sa-brazil-1
  availability: multi-az
  billing: monthly
templates:
  k8s_worker:
    service: ecs
    needs:
      vcpus: 8
      memory: "32 GiB"
    options:
      os: ubuntu-22.04
environments:
  dmz:
    region: sa-brazil-1
  prod:
    region: sa-brazil-1
resources:
  - id: worker-nodes
    environment: prod
    use: k8s_worker
    quantity: 6
    billing: yearly
  - id: archive-storage
    environment: prod
    service: obs
    billing: ondemand
    options:
      storage_class: standard
      capacity: "95043 GB"
      traffic: "150 TB/mo"
`;
    const q1 = parse(pipelineYaml);
    expect(await validate(q1)).toEqual([]);
    const p1 = await plan(ctx, q1);
    expect(p1.pending).toEqual([]);
    for (const row of p1.cards) {
      expect(row.unmapped_options).toEqual([]);
      expect(row.image_choices).toBeUndefined();
    }
  });
});
