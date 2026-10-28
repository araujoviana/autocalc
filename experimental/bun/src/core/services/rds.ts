import { assembleCard, stepper } from "../cards.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildRds(input: Extract<CardInput, { service: "rds" }>, context: BuilderContext) {
  const [vm, vol] = await Promise.all([
    selectProduct(context, "rds", input.region, "rds_rds.vm", input.flavor, input.billing, input.hours),
    selectProduct(context, "rds", input.region, "rds_rds.volume", input.storage_spec, input.billing, input.hours),
  ]);
  if (input.db_version) vm.dbVersion = input.db_version;
  const number = (v: unknown) => String(v ?? "").split("BSSUNIT")[0];
  const spec = `${number(vm.cpu)}dataInfo_40_dataInfo_24_${number(vm.mem)}BSSUNIT.pluralUnit.17dataInfo_66_`;
  const vmKeys = ["azMode", "dbType", "dbVersion", "instanceType", "publicType"];
  Object.assign(vm, { addToList_title: "calc_14_", addToList_product: `${vmKeys.map(key => String(vm[key] ?? "None")).join(" | ")} | ${spec}` });
  Object.assign(vol, { resourceSize: input.storage_gb, resouceSizeMeasureId: 17, resourceMeasureName: "", resourceMeasurePluralName: "", addToList_title: "calc_6_", addToList_product: `${String(vol.type ?? "None")} | ${input.storage_gb}BSSUNIT.pluralUnit.17` });
  const card = await assembleCard({ ...input, products: [vm, vol], description: "Relational Database Service", rewrite: { calculator_rdsvm_radio: Object.fromEntries(vmKeys.map(key => [key, vm[key] ?? null])), calculator_rdsvm_radio2: { spec }, calculator_rdsvolume_stepper: { type: vol.type ?? null, UNSET_Stepper_0: stepper(17, input.storage_gb) } } }, context.rate);
  const quantity = card.rewriteValue.global_QUANTITY as { UNSET_Stepper_0: { measureNameBeforeTrans: string; measurePluralNameBeforeTrans: string } };
  quantity.UNSET_Stepper_0.measureNameBeforeTrans = ""; quantity.UNSET_Stepper_0.measurePluralNameBeforeTrans = "";
  Object.assign(card.selectedProduct.purchaseNum as Record<string, unknown>, { measureNameBeforeTrans: "", measurePluralNameBeforeTrans: "" });
  return card;
}
