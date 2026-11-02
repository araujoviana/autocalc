import { assembleCard } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
import { roundPython } from "../rounding.ts";
export async function buildSfs(input: Extract<CardInput, { service: "sfsturbo" }>, context: BuilderContext) {
  const spec = input.tier.startsWith("sfs.turbo") ? input.tier : `sfs.turbo.${input.tier}`;
  const p = await selectProduct(context, "sfsturbo", input.region, "sfsturbo_sfsturbo", spec, input.billing, input.hours);
  const tb = roundPython(input.size_gb / 1024, 1);
  Object.assign(p, { resourceSize: input.size_gb, resouceSizeMeasureId: 17, resourceMeasureName: "", resourceMeasurePluralName: "", cpqPurchaseCapacity: input.size_gb, cpqPurchaseQuantity: input.quantity, addToList_title: "calc_18_", addToList_product: `${String(p.fileType ?? "None")} | ${String(p.sellingStatus ?? "None")} | ${String(p.sfsTypeList ?? "None")} | ${tb}BSSUNIT.unit.47` });
  const card = await assembleCard({ ...input, products: [p], description: "Scalable File Service Turbo", rewrite: { calculator_sfsType_radio: { fileType: p.fileType ?? null, sellingStatus: p.sellingStatus ?? null, sfsType: p.sfsType ?? null }, [spec === "sfs.turbo.20MBps" ? "calculator_sfsPeriod_36input" : "calculator_sfsPeriod_12input"]: tb } }, context.rate);
  const quantity = card.rewriteValue.global_QUANTITY as { UNSET_Stepper_0: { measureNameBeforeTrans: string; measurePluralNameBeforeTrans: string } };
  quantity.UNSET_Stepper_0.measureNameBeforeTrans = ""; quantity.UNSET_Stepper_0.measurePluralNameBeforeTrans = "";
  return card;
}
