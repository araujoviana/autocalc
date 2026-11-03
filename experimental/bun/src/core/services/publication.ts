/** What publish_quote needs to know about each builder (ports Python's VERIFIED, spec_arg and spec_option). */
import { supportedServices } from "./index.ts";

/** The calculator frontend the services below passed the live matrix on (stored = Edit = rating). */
export const VERIFIED_FRONTEND = "11.4.201";
/** Services whose page-encoded cards passed the live matrix. FunctionGraph, LTS and EIP (accepted defaults only) and
 * Redis (Python publishes it through a page recipe with no catalog-spec option) stay out until the schema layer maps them (4.3b). */
export const VERIFIED = new Set(["ecs", "evs", "cce", "elb", "obs", "rds", "sfsturbo", "apig", "apm", "cbr", "cci", "dew", "dline", "kafka", "nat", "nosql", "rabbitmq", "waf"]);
/** The build option that takes the ranked catalog spec; absent when the options alone say what to buy. */
export const SPEC_ARG: Record<string, string> = { apm: "spec", apig: "edition", dline: "port", sfsturbo: "tier", cbr: "vault_spec", rds: "flavor", evs: "type", nat: "size", ecs: "flavor" };
/** Catalog spec code -> the value the option expects. */
export const specOption = (service: string, spec: string) => service === "nat" ? spec.replace(/^natgateway_/, "") : spec;
/** Services whose form cannot express a quantity other than 1. */
export const SINGLE_QUANTITY = new Set(["nat", "obs", "lts", "function", "elb", "cci", "nosql"]);
export const modesOf = (service: string): string[] => supportedServices().find(entry => entry.service === service)?.modes ?? [];
