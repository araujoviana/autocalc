import { assembleCard, productFromCatalog, stepper } from "../cards.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
export async function buildNosql(input: Extract<CardInput, { service: "nosql" }>, context: BuilderContext) {
  if (input.engine !== "dynamodb") throw new CalculatorError("VALIDATION", "Only DynamoDB-compatible GeminiDB is supported");
  const catalog = await context.productInfo("nosql", input.region);
  const raw = catalog.product["nosql_nosql.vm"]?.find(p => p.resourceSpecCode === `geminidb.cassandra-geminifs.${input.flavor}` && p.versionType === "dataInfo_71_" && p.deploymentModal === "dataInfo_65_");
  if (!raw) throw new CalculatorError("SPEC_NOT_FOUND", `GeminiDB flavor ${input.flavor} not found`);
  if (["type", "version", "cpuType", "spec"].some(key => !Object.hasOwn(raw, key) || raw[key] === undefined)) throw new CalculatorError("UNEXPECTED_RESPONSE", "GeminiDB catalog entry is missing required form fields");
  const vm = productFromCatalog(raw, input.billing, input.hours);
  Object.assign(vm, { addToList_title: "calc_1_", addToList_product: `dataInfo_71_ | dataInfo_65_ | ${String(raw.type)} | ${String(raw.version)} | ${String(raw.cpuType)} | ${String(raw.spec)} | ${input.nodes} detail_37_`, productNum: input.nodes });
  const vol = await selectProduct(context, "nosql", input.region, "nosql_nosql.volume", "geminidb.cassandra-geminifs.ultrahigh", input.billing, input.hours);
  Object.assign(vol, { resourceSize: input.storage_gb, resouceSizeMeasureId: 17, resourceMeasureName: "", resourceMeasurePluralName: "", addToList_title: "calc_3_", addToList_product: `calc_4_ | ${input.storage_gb}BSSUNIT.pluralUnit.17`, productNum: 1 });
  const buyUrl = `https://console-intl.huaweicloud.com/nosql/?region=${input.region}&locale=en-us&payMode=${input.billing === "ondemand" ? 0 : 1}&dbType=DynamoDB&version=3.11&flavorId=${input.flavor}&volume=${input.storage_gb}&buyTime=${input.periods}&nodeNum=${input.nodes}&mode=custom#/instance/create`;
  return assembleCard({ ...input, quantity: 1, products: [vm, vol], description: "GeminiDB DynamoDB", rewrite: { calculator_nosql_versionType_group: { versionType: "dataInfo_71_", deploymentModal: "dataInfo_65_" }, calculator_nosql_versionType_radio: { type: raw.type ?? null, version: raw.version ?? null, cpuType: raw.cpuType ?? null }, calculator_nosql_vm_select: { spec: raw.spec ?? null }, calculator_nosql_colony_node_stepper: { UNSET_Stepper_0: stepper(41, input.nodes, "dataInfo_12_") }, calculator_nosql_rs_stepper: { ioType: "calc_4_", UNSET_Stepper_0: stepper(17, input.storage_gb) } }, buyUrl, includeQuantity: false }, context.rate);
}
