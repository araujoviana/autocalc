import { assembleCard, stepper } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
/** The engine's plain volume SKU (`rds.mysql.volume.cloudssd`, else `.common`), so a card need not name it. */
async function defaultVolume(context: BuilderContext, region: string, flavor: string): Promise<string> {
  const engine = flavor.split(".")[1] ?? "";
  const specs = ((await context.productInfo("rds", region)).product["rds_rds.volume"] ?? []).map((p: Record<string, unknown>) => String(p.resourceSpecCode));
  const found = [`rds.${engine}.volume.cloudssd`, `rds.${engine}.volume.common`].find(spec => specs.includes(spec));
  if (!found) throw new CalculatorError("VALIDATION", `No default volume for engine '${engine}'.`, "Set options.storage_spec; see `autocalc search rds <region> volume`.");
  return found;
}
export async function buildRds(input: Extract<CardInput, { service: "rds" }>, context: BuilderContext) {
  const storageSpec = input.storage_spec ?? await defaultVolume(context, input.region, input.flavor);
  const [vm, vol] = await Promise.all([
    selectProduct(context, "rds", input.region, "rds_rds.vm", input.flavor, input.billing, input.hours),
    selectProduct(context, "rds", input.region, "rds_rds.volume", storageSpec, input.billing, input.hours),
  ]);
  if (input.db_version) vm.dbVersion = input.db_version;
  const number = (v: unknown) => String(v ?? "").split("BSSUNIT")[0];
  const spec = `${number(vm.cpu)}dataInfo_40_dataInfo_24_${number(vm.mem)}BSSUNIT.pluralUnit.17dataInfo_66_`;
  const vmKeys = ["azMode", "dbType", "dbVersion", "instanceType", "publicType"];
  const radioKeys = ["dbType", "dbVersion", "instanceType", "azMode", "publicType"];
  Object.assign(vm, { addToList_title: "calc_14_", addToList_product: `${vmKeys.map(key => String(vm[key] ?? "None")).join(" | ")} | ${spec}` });
  Object.assign(vol, { resourceSize: input.storage_gb, resouceSizeMeasureId: 17, resourceMeasureName: "", resourceMeasurePluralName: "", addToList_title: "calc_6_", addToList_product: `${String(vol.type ?? "None")} | ${input.storage_gb}BSSUNIT.pluralUnit.17` });
  const card = await assembleCard({ ...input, products: [vm, vol], description: "Relational Database Service", rewrite: { calculator_rdsvm_radio: Object.fromEntries(radioKeys.map(key => [key, vm[key] ?? null])), calculator_rdsvm_radio2: { spec }, calculator_rdsvolume_stepper: { type: vol.type ?? null, UNSET_Stepper_0: stepper(17, input.storage_gb) } } }, context.rate);
  const quantity = card.rewriteValue.global_QUANTITY as { UNSET_Stepper_0: { measureNameBeforeTrans: string; measurePluralNameBeforeTrans: string } };
  quantity.UNSET_Stepper_0.measureNameBeforeTrans = ""; quantity.UNSET_Stepper_0.measurePluralNameBeforeTrans = "";
  Object.assign(card.selectedProduct.purchaseNum as Record<string, unknown>, { measureNameBeforeTrans: "", measurePluralNameBeforeTrans: "" });
  return card;
}
