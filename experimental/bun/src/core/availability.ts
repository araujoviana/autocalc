import { CalculatorError } from "./errors.ts";
import { vendorServiceCode } from "./endpoints.ts";
const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function checkAvailability(menu: unknown, service: string, region: string, billing: "ondemand" | "monthly" | "yearly" | "ri"): void {
  const categories = obj(menu).menuInfos;
  if (!Array.isArray(categories)) throw new CalculatorError("UNEXPECTED_RESPONSE", "Menu has no service entries");
  const nodes = categories.flatMap(category => Array.isArray(obj(category).subCategoryLists) ? obj(category).subCategoryLists as unknown[] : []);
  const node = nodes.map(obj).find(item => item.urlPath === vendorServiceCode(service));
  if (!node) throw new CalculatorError("SERVICE_NOT_SOLD", `Unknown service ${service}`, undefined, { service });
  const online = obj(node.regionOnline), regions = Array.isArray(online.regionList) ? online.regionList : [];
  if (!regions.includes(region)) throw new CalculatorError("SERVICE_NOT_SOLD", `${service} is not sold in ${region}`, regions.length ? `Available regions: ${regions.slice(0, 8).join(", ")}` : undefined, { service, region });
  const offered = obj(online[region]).common;
  const wanted = billing === "ri" ? "RI" : billing === "ondemand" ? "ONDEMAND" : "PERIOD";
  if (Array.isArray(offered) && offered.length && !offered.includes(wanted)) throw new CalculatorError("MODE_NOT_OFFERED", `${billing} is not offered in ${region}`, `Available modes: ${offered.join(", ")}`, { service, region, offered });
}
