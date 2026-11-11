import { CardInput } from "../schemas.ts";
import { ACCEPTED_DEFAULT_ONLY, RECIPES } from "./forms.ts";
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
export const PRIMARY_GROUP: Record<string, string> = { ecs: "ec2_vm", evs: "ebs_volume", rds: "rds_rds.vm", sfs: "sfs_sfs", sdrs: "sdrs_hdrsinst", er: "er_er.attachment", eip: "vpc_bandwidth", function: "functionstage_functionstage", lts: "lts_lts.logflow", vpcep: "vpc_vpcep", hss: "hss_hss", cfw: "cfw_cfw", vpn: "vpc_bandwidth", des: "des_des", dss: "dss_dss.pool", maas: "modelarts_modelarts.tokens", memcached: "dcs_dcs.memcached", drs: "drs_drs.vm", ddm: "ddm_ddm", dds: "dds_dds.vm", gaussdb: "gaussdb_gaussdb.vm", rdsformariadb: "rdsformariadb_rdsformariadb.vm", taurusdb: "taurus_taurus.vm", hrds: "rds_rds.vm", redis: "dcs_dcs3", cbr: "cbr_cbr.vault", cce: "cce_cce.cluster", apig: "apig_apig.instance", nat: "natgateway_natgateway", elb: "elb_elbv2", nosql: "nosql_nosql.vm", kafka: "dms_dms.platinum", rabbitmq: "dms_dms.platinum", sfsturbo: "sfsturbo_sfsturbo", apm: "apm_apm2.instance", dline: "dcaas_dcaas.port", ssa: "sa_secmaster.typical" };
/** Catalog spec code -> the value the option expects. */
export const specOption = (service: string, spec: string) => service === "nat" ? spec.replace(/^natgateway_/, "") : service === "evs" ? spec.replace(/\.storage$/, "") : spec;
/** Services whose pay-per-use SKUs carry usage plans with no list price in the catalog (OBS) or tiered by capacity (DSS): the card is priced from its usage components when rated, so a plan can only resolve the spec, not price it. */
export const USAGE_PRICED = new Set(["obs", "dss", "memcached", "maas"]);
/** Recipe services whose page controls are fields of the chosen catalog SKU: the ranked spec becomes these option values. The others have page controls (shards, storage, groups) that no catalog row carries. */
export const RECIPE_SPEC_FIELDS: Record<string, { group: string; fields: Array<string | [option: string, field: string]> }> = {
  redis: { group: "dcs_dcs3", fields: ["instance_type", "version", "edition", "cpu_storage", "spec"] },
  sfs: { group: "sfs_sfs", fields: [] }, // one SKU (SFS_SATA) whose price the capacity control scales: the spec only has to exist
  sdrs: { group: "sdrs_hdrsinst", fields: [] }, // one SKU; the protection-group count scales it
  function: { group: "functionstage_functionstage", fields: [] },
  lts: { group: "lts_lts.logflow", fields: [] },
  eip: { group: "vpc_bandwidth", fields: [] }, // the dedicated-bandwidth SKU (19_bgp); the bandwidth control scales it
  vpcep: { group: "vpc_vpcep", fields: [] }, // one SKU (vpcep.basic); the hours control scales it
  hss: { group: "hss_hss", fields: [] }, // the edition option picks the page's edition; the spec has to agree, which the gate checks
  cfw: { group: "cfw_cfw", fields: [] }, // same: edition option vs spec
  vpn: { group: "vpc_bandwidth", fields: [] },
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
  if (service in RECIPES) return Object.keys(RECIPES[service]!.controls).sort();
  const entry = (CardInput as unknown as { options: Array<{ shape: Record<string, any> }> }).options.find(option => option.shape.service.def.values[0] === service);
  return entry ? Object.keys(entry.shape).filter(key => !NOT_OPTIONS.has(key) && key !== SPEC_ARG[service]).sort() : null;
}

/** The page's HSS edition value for each catalog spec (live-verified: stored = rated = Edit for all but advanced, which was seen on the page). */
const HSS_EDITIONS: Record<string, string> = { "hss.version.basic": "dataInfo_1_", "hss.version.premium": "dataInfo_4_", "hss.version.wtp": "dataInfo_3_", "hss.version.container.enterprise": "dataInfo_5_", "hss.version.advanced": "dataInfo_6_" };
/** What a chosen spec rules out, found at plan time instead of after minutes of page encoding. Returns the problem, or null. */
export const SPEC_RULES: Record<string, (spec: string, options: Record<string, unknown>) => string | null> = {
  eip: (spec, options) => {
    const traffic = options.billed_by === "dataInfo_6_" || options.billed_by === "traffic" || options.traffic_gb !== undefined;
    if (traffic && spec !== "12_bgp") return `EIP billed by traffic prices the 12_bgp SKU, not ${spec}.`;
    if (traffic && options.bandwidth_mbps !== undefined) return "EIP billed by traffic has `traffic_gb`, not `bandwidth_mbps`.";
    return null;
  },
  des: (spec, options) => options.devices !== undefined && !spec.startsWith("des.teleport") ? `\`devices\` (onsite days) exists only on Teleport devices, not on ${spec}.` : null,
  hss: (spec, options) => {
    const want = HSS_EDITIONS[spec];
    return want && options.edition !== undefined && options.edition !== want ? `HSS spec ${spec} is page edition ${want}, not ${String(options.edition)}.` : null;
  },
  vpn: (_spec, options) => {
    const set = (...names: string[]) => names.filter(n => options[n] !== undefined);
    const p2c = options.mode === "dataInfo_21_", priv = options.network_type === "dataInfo_15_";
    if (p2c) { const bad = set("eip1_mbps", "eip2_mbps", "spec", "connection_groups", "private_spec", "network_type"); if (bad.length) return `VPN Point-to-Cloud has its own controls (p2c_*); ${bad.join(", ")} exist only in Site-to-Cloud mode.`; }
    else if (set("p2c_eip_mbps", "p2c_connections", "p2c_spec").length) return "p2c_* options need mode dataInfo_21_ (Point-to-Cloud).";
    if (priv) { const bad = set("eip1_mbps", "eip2_mbps", "spec"); if (bad.length) return `A private-network VPN has no EIPs and uses private_spec; ${bad.join(", ")} exist only on a public network.`; }
    else if (!p2c && options.private_spec !== undefined) return "private_spec needs network_type dataInfo_15_ (private network).";
    return null;
  },
  hrds: spec => /\.y1\./.test(spec) ? null : `Dedicated RDS (hrds) is sold as the y1 family (rds.<engine>.y1.*), not ${spec}.`,
};
