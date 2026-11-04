import { CardInput } from "../schemas.ts";
import { ACCEPTED_DEFAULT_ONLY, LTS_PAGE_OPTIONS, RECIPES } from "./forms.ts";
/** What publish_quote needs to know about each builder (ports Python's VERIFIED, spec_arg and spec_option). */
import { supportedServices } from "./index.ts";

/** The calculator frontend the services below passed the live matrix on (stored = Edit = rating). */
export const VERIFIED_FRONTEND = "11.4.201";
/** Services whose page-encoded cards passed the live matrix. FunctionGraph, LTS and accepted-default-only recipes stay out. */
export const VERIFIED = new Set([
  "ecs", "evs", "cce", "elb", "obs", "rds", "sfsturbo", "apig", "apm", "cbr", "cci", "dew", "dline", "kafka", "nat", "nosql", "rabbitmq", "waf",
  ...Object.keys(RECIPES).filter(service => !ACCEPTED_DEFAULT_ONLY.has(service)),
]);
/** The build option that takes the ranked catalog spec; absent when the options alone say what to buy. */
export const SPEC_ARG: Record<string, string> = { apm: "spec", apig: "edition", dline: "port", sfsturbo: "tier", cbr: "vault_spec", rds: "flavor", evs: "type", nat: "size", ecs: "flavor" };
/** The catalog group that holds the thing a card's spec names; without it a plan's candidates mix in disks and add-ons of the same service. */
export const PRIMARY_GROUP: Record<string, string> = { ecs: "ec2_vm", evs: "ebs_volume", rds: "rds_rds.vm" };
/** Catalog spec code -> the value the option expects. */
export const specOption = (service: string, spec: string) => service === "nat" ? spec.replace(/^natgateway_/, "") : service === "evs" ? spec.replace(/\.storage$/, "") : spec;
/** Services whose pay-per-use SKUs carry usage plans with no list price in the catalog (OBS): the card is priced from its usage components when rated, so a plan can only resolve the spec, not price it. */
export const USAGE_PRICED = new Set(["obs"]);
/** Recipe services whose page controls are fields of the chosen catalog SKU: the ranked spec becomes these option values. The others have page controls (shards, storage, groups) that no catalog row carries. */
export const RECIPE_SPEC_FIELDS: Record<string, { group: string; fields: string[] }> = {
  redis: { group: "dcs_dcs3", fields: ["instance_type", "version", "edition", "cpu_storage", "spec"] },
};
/** Services whose form cannot express a quantity other than 1. */
export const SINGLE_QUANTITY = new Set([
  "nat", "obs", "lts", "function", "elb", "cci", "nosql",
  ...Object.entries(RECIPES).filter(([, r]) => !r.quantity).map(([s]) => s),
]);
export const modesOf = (service: string): string[] => {
  if (service in RECIPES) return [...RECIPES[service]!.modes];
  return supportedServices().find(entry => entry.service === service)?.modes ?? [];
};

const NOT_OPTIONS = new Set(["service", "region", "billing", "quantity", "periods", "hours"]);
/** The option names a card of this service may carry: the builder input minus what a requirement has itself. */
export function legalOptions(service: string): string[] | null {
  if (service === "lts") return [...LTS_PAGE_OPTIONS].sort();
  if (service in RECIPES) return Object.keys(RECIPES[service]!.controls).sort();
  const entry = (CardInput as unknown as { options: Array<{ shape: Record<string, any> }> }).options.find(option => option.shape.service.def.values[0] === service);
  return entry ? Object.keys(entry.shape).filter(key => !NOT_OPTIONS.has(key) && key !== SPEC_ARG[service]).sort() : null;
}
