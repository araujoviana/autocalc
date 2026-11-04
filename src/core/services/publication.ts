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
export const PRIMARY_GROUP: Record<string, string> = { ecs: "ec2_vm", evs: "ebs_volume", rds: "rds_rds.vm", sfs: "sfs_sfs", sdrs: "sdrs_hdrsinst", er: "er_er.attachment", des: "des_des", dss: "dss_dss.pool", maas: "modelarts_modelarts.tokens", memcached: "dcs_dcs.memcached", drs: "drs_drs.vm", ddm: "ddm_ddm", dds: "dds_dds.vm", gaussdb: "gaussdb_gaussdb.vm", rdsformariadb: "rdsformariadb_rdsformariadb.vm", taurusdb: "taurus_taurus.vm", hrds: "rds_rds.vm" };
/** Catalog spec code -> the value the option expects. */
export const specOption = (service: string, spec: string) => service === "nat" ? spec.replace(/^natgateway_/, "") : service === "evs" ? spec.replace(/\.storage$/, "") : spec;
/** Services whose pay-per-use SKUs carry usage plans with no list price in the catalog (OBS) or tiered by capacity (DSS): the card is priced from its usage components when rated, so a plan can only resolve the spec, not price it. */
export const USAGE_PRICED = new Set(["obs", "dss", "memcached", "maas"]);
/** Recipe services whose page controls are fields of the chosen catalog SKU: the ranked spec becomes these option values. The others have page controls (shards, storage, groups) that no catalog row carries. */
export const RECIPE_SPEC_FIELDS: Record<string, { group: string; fields: Array<string | [option: string, field: string]> }> = {
  redis: { group: "dcs_dcs3", fields: ["instance_type", "version", "edition", "cpu_storage", "spec"] },
  sfs: { group: "sfs_sfs", fields: [] }, // one SKU (SFS_SATA) whose price the capacity control scales: the spec only has to exist
  sdrs: { group: "sdrs_hdrsinst", fields: [] }, // one SKU; the protection-group count scales it
  er: { group: "er_er.attachment", fields: [] }, // the attachment SKU; the traffic SKU is added by the page from downflow_gb
  des: { group: "des_des", fields: [["transfer_type", "transferTypeClass"]] }, // Teleport or Disk
  dss: { group: "dss_dss.pool", fields: [["type", "type"]] }, // pool type from the SKU; capacity is an option, many SKUs share one code
  maas: { group: "modelarts_modelarts.tokens", fields: [["model_series", "modelSeries"], ["model_name", "modelName"], ["model_service_type", "modelServiceType"], ["reasoning_mode", "reasoningMode"], ["billing_mode_type", "billingModeType"]] }, // Hong Kong only (beta); usage is in million tokens
  memcached: { group: "dcs_dcs.memcached", fields: [["instance_type", "instance_type"]] },
  drs: { group: "drs_drs.vm", fields: [["type", "drsType"], ["flow", "flowInout"], ["specification", "specificationType"]] },
  ddm: { group: "ddm_ddm", fields: [["spec_type", "specType"], ["spec", "specBefore"]] },
  dds: { group: "dds_dds.vm", fields: [["flavor_type", "flavorType"], ["shard_spec", "spec"]] },
  gaussdb: { group: "gaussdb_gaussdb.vm", fields: [["deploy_model", "deployModel"], ["instance_type", "insType"], ["db_version", "dbOpenGaussVersion"], ["database_type", "databseType"], ["public_type", "publicOpengaussType"], ["spec", "spec"]] },
  rdsformariadb: { group: "rdsformariadb_rdsformariadb.vm", fields: [["instance_type", "instanceType"], ["db_version", "dbVersion"], ["public_type", "publicType"], ["spec", "spec"]] },
  taurusdb: { group: "taurus_taurus.vm", fields: [["enterprise_instance", "enterpriseInstance"], ["public_type", "publicGaussdbType"], ["spec", "spec"]] },
  hrds: { group: "rds_rds.vm", fields: [["spec", "spec"]] }, // engine, version and instance type are not on the SKU row: give them as options
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

/** What a chosen spec rules out, found at plan time instead of after minutes of page encoding. Returns the problem, or null. */
export const SPEC_RULES: Record<string, (spec: string, options: Record<string, unknown>) => string | null> = {
  des: (spec, options) => options.devices !== undefined && !spec.startsWith("des.teleport") ? `\`devices\` (onsite days) exists only on Teleport devices, not on ${spec}.` : null,
  hrds: spec => /\.y1\./.test(spec) ? null : `Dedicated RDS (hrds) is sold as the y1 family (rds.<engine>.y1.*), not ${spec}.`,
};
