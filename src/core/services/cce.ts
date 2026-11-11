import { assembleCard } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";

/**
 * Builds a CCE (Cloud Container Engine) quote card.
 *
 * Current vendor evidence (Huawei Cloud calculator portal config, 2026.11):
 * - clusterType: maps cce.s(1|2).* to dataInfo_2_ ("Standard/Turbo").
 * - clusterMasterScale: cce.s2.* -> dataInfo_4_ (HA / 3 masters); cce.s1.* -> dataInfo_5_ (Single master).
 * - clusterNodeScale: 50 -> dataInfo_50_, 200 -> dataInfo_200_, 1000 -> dataInfo_1000_, 2000 -> dataInfo_2000_.
 * - Standalone cce.t1/t2 SKUs exist in catalog but lack UI selector mappings in portal config.
 *   The portal UI represents Standard/Turbo via the unified cce.s1/s2 family.
 *
 * All required vendor controls are validated from catalog product data; no guessed fallback tokens.
 */
export async function buildCce(input: Extract<CardInput, { service: "cce" }>, context: BuilderContext) {
  const clusterType = (input.cluster_type ?? "standard").toLowerCase();
  if (clusterType !== "standard" && clusterType !== "turbo") {
    throw new CalculatorError("VALIDATION", `Unsupported CCE cluster type ${input.cluster_type}`);
  }

  if (!["small", "medium", "large", "xlarge"].includes(input.scale)) {
    throw new CalculatorError("VALIDATION", `Unknown CCE scale ${input.scale}`);
  }

  const series = input.ha ? "s2" : "s1";
  const spec = `cce.${series}.${input.scale}`;

  const p = await selectProduct(context, "cce", input.region, "cce_cce.cluster", spec, input.billing, input.hours);
  if (input.billing === "ondemand" && !Object.hasOwn(p, "usageFactor")) p.usageFactor = "duration";

  // Strict validation: required controls must be present on catalog product; fail closed if omitted
  if (!p.productType) {
    throw new CalculatorError("SPEC_NOT_FOUND", `CCE catalog SKU ${spec} in ${input.region} is missing required vendor control 'productType'`);
  }
  if (!p.clusterType) {
    throw new CalculatorError("SPEC_NOT_FOUND", `CCE catalog SKU ${spec} in ${input.region} is missing required vendor control 'clusterType'`);
  }
  if (!p.clusterMasterScale) {
    throw new CalculatorError("SPEC_NOT_FOUND", `CCE catalog SKU ${spec} in ${input.region} is missing required vendor control 'clusterMasterScale'`);
  }
  if (!p.clusterNodeScale) {
    throw new CalculatorError("SPEC_NOT_FOUND", `CCE catalog SKU ${spec} in ${input.region} is missing required vendor control 'clusterNodeScale'`);
  }

  const keys = ["productType", "clusterType", "clusterNodeScale", "clusterMasterScale"];
  Object.assign(p, { addToList_title: "dataInfo_15_", addToList_product: keys.map(key => String(p[key] ?? "None")).join(" | ") });
  const render = Object.fromEntries(keys.map(key => [key, p[key] ?? null]));
  const card = await assembleCard(
    {
      ...input,
      products: [p],
      description: "Cloud Container Engine",
      rewrite: { calculator_clustertype_radio: render },
      includeQuantity: input.billing !== "ondemand",
    },
    context.rate
  );

  const quantity = card.rewriteValue.global_QUANTITY as { UNSET_Stepper_0: { measureNameBeforeTrans: string; measurePluralNameBeforeTrans: string } } | undefined;
  if (quantity) {
    quantity.UNSET_Stepper_0.measureNameBeforeTrans = "";
    quantity.UNSET_Stepper_0.measurePluralNameBeforeTrans = "";
  }
  if (card.selectedProduct.purchaseNum) {
    Object.assign(card.selectedProduct.purchaseNum as Record<string, unknown>, { measureNameBeforeTrans: "", measurePluralNameBeforeTrans: "" });
  }
  return card;
}
