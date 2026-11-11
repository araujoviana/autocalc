import { assembleCard, stepper } from "../cards.ts";
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
 *   The portal UI represents Standard/Turbo via the unified cce.s1/s2 family. Standalone t* requests fail closed.
 * - CCE Autopilot: offered in sa-brazil-1 (cce.autopilot.cluster, productType: "dataInfo_36_") with optional
 *   container CPU and memory from cci_cci.autopilot. Autopilot is unoffered in la-south-2 (Santiago).
 *
 * All required vendor controls are validated from catalog product data; no guessed fallback tokens.
 */
export async function buildCce(input: Extract<CardInput, { service: "cce" }>, context: BuilderContext) {
  // Reject explicit standalone legacy Turbo SKUs with clear portal limitation error
  if (input.spec?.startsWith("cce.t")) {
    throw new CalculatorError(
      "MODE_NOT_OFFERED",
      `Standalone CCE Turbo legacy SKU '${input.spec}' cannot be encoded or added to list on the portal (portal limitation: control disabled). The portal calculator represents Standard/Turbo via the unified cce.s1/s2 cluster family.`
    );
  }

  const clusterType = (input.cluster_type ?? "standard").toLowerCase();
  if (clusterType !== "standard" && clusterType !== "turbo" && clusterType !== "autopilot") {
    throw new CalculatorError("VALIDATION", `Unsupported CCE cluster type ${input.cluster_type}`);
  }

  // 1. CCE Autopilot cluster
  if (clusterType === "autopilot") {
    if (input.region === "la-south-2") {
      throw new CalculatorError(
        "SPEC_NOT_FOUND",
        `CCE Autopilot is not offered in la-south-2 (Santiago). Santiago only offers CCE Standard/Turbo clusters.`
      );
    }

    const p = await selectProduct(context, "cce", input.region, "cce_cce.autopilot", "cce.autopilot.cluster", input.billing, input.hours);
    if (!p.productType) {
      throw new CalculatorError("SPEC_NOT_FOUND", `CCE Autopilot SKU in ${input.region} is missing required vendor control 'productType'`);
    }
    if (p.productType !== "dataInfo_36_") {
      throw new CalculatorError("SPEC_NOT_FOUND", `CCE Autopilot SKU in ${input.region} has unexpected productType '${String(p.productType)}', expected 'dataInfo_36_'`);
    }

    Object.assign(p, {
      addToList_title: "dataInfo_15_",
      addToList_product: "dataInfo_36_",
      productNum: 1,
      inquiryTag: "normal",
    });
    if (input.billing === "ondemand" && !Object.hasOwn(p, "usageFactor")) p.usageFactor = "duration";
    const products = [p];

    const render: Record<string, unknown> = {
      calculator_clustertype_radio: { productType: "dataInfo_36_" },
      calculator_cce_cciType_switch: { cciType: "calc_17_" },
    };

    const vcpus = input.vcpus ?? 0;
    const memoryGb = input.memory_gb ?? 0;
    if (vcpus > 0) {
      const cpuProd = await selectProduct(context, "cce", input.region, "cci_cci.autopilot", "autopilot.container.cpu", input.billing, input.hours);
      Object.assign(cpuProd, {
        addToList_title: "calc_45_",
        addToList_product: "calc_17_",
        resourceSize: vcpus,
        resouceSizeMeasureId: 14,
        usageFactor: "duration",
        usageMeasureId: 6,
        usageValue: input.hours * 3600,
        productNum: 1,
      });
      products.push(cpuProd);
      render.calculator_vCPUs_stepper = { UNSET_Stepper_0: stepper(14, vcpus, "dataInfo_39_", "dataInfo_39_") };
    }
    if (memoryGb > 0) {
      const memProd = await selectProduct(context, "cce", input.region, "cci_cci.autopilot", "autopilot.container.mem", input.billing, input.hours);
      Object.assign(memProd, {
        addToList_title: "calc_43_",
        addToList_product: "calc_17_",
        resourceSize: memoryGb,
        resouceSizeMeasureId: 14,
        usageFactor: "duration",
        usageMeasureId: 6,
        usageValue: input.hours * 3600,
        productNum: 1,
      });
      products.push(memProd);
      render.calculator_mem_stepper = { UNSET_Stepper_0: stepper(14, memoryGb, "dataInfo_41_", "dataInfo_41_") };
    }

    return assembleCard(
      {
        ...input,
        products,
        description: "Cloud Container Engine",
        rewrite: render,
        includeQuantity: input.billing !== "ondemand",
      },
      context.rate
    );
  }

  // 2. CCE Standard / Turbo cluster (unified cce.s1 / cce.s2 family)
  if (!["small", "medium", "large", "xlarge"].includes(input.scale)) {
    throw new CalculatorError("VALIDATION", `Unknown CCE scale ${input.scale}`);
  }

  const series = input.ha ? "s2" : "s1";
  const spec = input.spec && !input.spec.startsWith("cce.t") ? input.spec : `cce.${series}.${input.scale}`;

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
