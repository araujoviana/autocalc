/** Services with no full-card builder: a recipe names the page's controls, the page builds the card.
 * Port of src/autocalc/services/forms.py and LTS page form from src/autocalc/services/lts.py.
 */
import { stepper } from "../cards.ts";
import { invalid } from "../quote/model.ts";

export type BillingMode = "monthly" | "yearly" | "ondemand";

export interface Recipe {
  description: string;
  controls: Record<string, string>;
  hours?: boolean;
  quantity?: boolean;
  regionless?: boolean;
  modes: readonly BillingMode[];
}

const ALL_MODES: readonly BillingMode[] = ["monthly", "yearly", "ondemand"];
const PM: readonly BillingMode[] = ["monthly", "yearly"];
const OD: readonly BillingMode[] = ["ondemand"];
const PM_OD: readonly BillingMode[] = ["monthly", "yearly", "ondemand"];

const recipe = (
  description: string,
  controls: Record<string, string>,
  opts: { hours?: boolean; quantity?: boolean; regionless?: boolean; modes?: readonly BillingMode[] } = {},
): Recipe => ({
  description,
  controls,
  hours: opts.hours ?? false,
  quantity: opts.quantity ?? false,
  regionless: opts.regionless ?? false,
  modes: opts.modes ?? ALL_MODES,
});

export const RECIPES: Record<string, Recipe> = {
  redis: recipe("Distributed Cache Service (Redis)", {
    instance_type: "calculator_redis_version_instance_type",
    version: "calculator_redis_version_version",
    edition: "calculator_redis_version_edition",
    cpu_storage: "calculator_redis_version_cpu_storage",
    spec: "calculator_redis_version_spec",
    instances: "calculator_redis_quantity_Stepper_0",
  }, { modes: PM }),
  memcached: recipe("Distributed Cache Service (Memcached)", {
    instance_type: "calculator_memcached_version_instance_type",
    memory_gb: "calculator_memcached_version_Stepper_0",
  }, { hours: true, quantity: true, modes: OD }),
  dds: recipe("Document Database Service", {
    type: "calculator_dds_versionType_radio_type",
    flavor_type: "calculator_dds_versionType_radio_flavorType",
    shard_spec: "calculator_dds_colony_shard_spec",
    shards: "calculator_dds_colony_shard_Stepper_0",
    shard_storage_gb: "calculator_dds_colony_shard_volume_Stepper_0",
  }, { quantity: true }),
  gaussdb: recipe("GaussDB", {
    deploy_model: "calculator_opgauss_radio_deployModel",
    instance_type: "calculator_opgauss_radio_insType",
    db_version: "calculator_opgauss_radio_dbOpenGaussVersion",
    database_type: "calculator_opgauss_radio_databseType",
    public_type: "calculator_opgauss_spec_radio_publicOpengaussType",
    spec: "calculator_opgauss_spec_radio_spec",
    storage_gb: "calculator_openGauss_volume_stepper_Stepper_0",
  }, { quantity: true }),
  rdsformariadb: recipe("RDS for MariaDB", {
    instance_type: "calculator_rdsvm_radio_instanceType",
    db_version: "calculator_rdsvm_radio_dbVersion",
    public_type: "calculator_rdsvm_radio_publicType",
    spec: "calculator_rdsvm_radio2_spec",
    storage_gb: "calculator_rdsvolume_stepper_Stepper_0",
  }, { quantity: true }),
  taurusdb: recipe("TaurusDB", {
    enterprise_instance: "calculator_gaussdb_radio_enterpriseInstance",
    public_type: "calculator_gaussdb_publicType_switch_publicGaussdbType",
    spec: "calculator_gaussdb_publicType_switch_spec",
    nodes: "calculator_gaussdb_publicType_switch_Stepper_0",
    storage_gb: "calculator_gaussdb_volume_stepper_Stepper_0",
  }, { quantity: true }),
  hrds: recipe("Dedicated RDS", {
    instance_type: "calculator_rdsvm_radio_instanceType",
    db_type: "calculator_rdsvm_radio_dbType",
    db_version: "calculator_rdsvm_radio_dbVersion",
    spec: "calculator_rdsvm_radio2_spec",
    storage_gb: "calculator_rdsvolume_stepper_Stepper_0",
  }, { quantity: true, modes: PM }),
  ddm: recipe("Distributed Database Middleware", {
    spec_type: "calculator_insSpec_radio_specType",
    spec: "calculator_insSpec_radio_specBefore",
  }, { quantity: true }),
  drs: recipe("Data Replication Service", {
    type: "calculator_drsvm_radio_drsType",
    flow: "calculator_drsvm_radio_flowInout",
    specification: "calculator_drsvm_radio_specificationType",
  }, { quantity: true }),
  sfs: recipe("Scalable File Service", {
    capacity_gb: "calculator_sfsDemand_radio_Stepper_0",
  }, { hours: true, modes: OD }),
  dss: recipe("Dedicated Distributed Storage Service", {
    type: "calculator_dssDemand_radio_type",
    capacity: "calculator_dssDemand_radio_dssDivision",
  }, { modes: ["yearly"] }),
  sdrs: recipe("Storage Disaster Recovery Service", {
    protection_groups: "calculator_sdrs_stepper_Stepper_0",
  }, { hours: true, modes: OD }),
  des: recipe("Data Express Service", {
    transfer_type: "calculator_product_select_transferTypeClass",
    devices: "calculator_product_stepper_Stepper_0",
  }, { quantity: true, modes: OD }),
  er: recipe("Enterprise Router", {
    downflow_gb: "calculator_downflow_stepper_Stepper_0",
    attachment_hours: "calculator_attachment_time_stepper_Stepper_0",
    attachments: "calculator_attachment_stepper_Stepper_0",
  }, { modes: OD }),
  maas: recipe("Model as a Service (ModelArts Studio)", {
    model_series: "calculator_ucsType_radio_ondemand_modelSeries",
    model_name: "calculator_ucsType_radio_ondemand_modelName",
    model_service_type: "calculator_ucsType_radio_ondemand_modelServiceType",
    reasoning_mode: "calculator_ucsType_radio_ondemand_reasoningMode",
    billing_mode_type: "calculator_ucsType_radio_ondemand_billingModeType",
    input_mtokens: "calculator_Input_stepper_Stepper_0",
    output_mtokens: "calculator_output_stepper_Stepper_0",
    cached_input_mtokens: "calculator_token_cached_input_stepper_Stepper_0",
  }, { modes: OD }),
  esw: recipe("Enterprise Switch", {}, { modes: PM_OD }),
  vpcep: recipe("VPC Endpoint", {
    duration_hours: "calculator_vpcep_time_Stepper_0",
  }, { modes: OD }),
  eip: recipe("Elastic IP", {
    ip_quantity: "calculator_ipQuantity_stepper_Stepper_0",
    bandwidth_mbps: "calculator_eip_radio_Stepper_0",
  }, { modes: PM_OD }),
  vpn: recipe("Virtual Private Network", {
    eip1_mbps: "calculator_evpnEip1_stepper_Stepper_0",
    eip2_mbps: "calculator_evpnEip2_stepper_Stepper_0",
    spec: "calculator_evpnGatewaySpec_radio_calGatewaySpec",
  }, { modes: PM_OD }),
  cfw: recipe("Cloud Firewall", {
    edition: "calculator_cfw_editionRadio_edition",
    bandwidth_mbps: "calculator_cfw_bandwidthStepper_Stepper_0",
    eips: "calculator_cfw_eipStepper_Stepper_0",
  }, { modes: PM_OD }),
  hss: recipe("Host Security Service", {
    edition: "calculator_hssType_radio_type",
  }, { quantity: true, modes: PM_OD }),
  dbss: recipe("Database Security Service", {}, { quantity: true, modes: PM }),
  dsc: recipe("Data Security Center", {}, { quantity: true, modes: PM }),
  ga: recipe("Global Accelerator", {}, { regionless: true, modes: OD }),
  cc: recipe("Cloud Connect", {}, { quantity: true, regionless: true, modes: PM }),
  aad: recipe("Anti-DDoS Advanced", {}, { quantity: true, regionless: true, modes: PM }),
  edgesec: recipe("Edge Security", {}, { regionless: true, modes: ["monthly"] }),
  ucs: recipe("Ubiquitous Cloud Native Service", {}, { regionless: true, modes: PM_OD }),
  ssa: recipe("Situation Awareness", {
    edition: "calculator_ssa_edition_version1",
  }, { modes: OD }),
  reliability: recipe("Reliability (Distributed Message Service)", {}, { quantity: true, modes: PM_OD }),
  hecs: recipe("Flexus X Instance", {}, { quantity: true, modes: PM_OD }),
};

export const ACCEPTED_DEFAULT_ONLY = new Set(
  Object.entries(RECIPES).filter(([, r]) => Object.keys(r.controls).length === 0).map(([s]) => s),
);

const CHARGE: Record<BillingMode, [string, number]> = {
  monthly: ["PERIOD", 20],
  yearly: ["PERIOD", 19],
  ondemand: ["ONDEMAND", 4],
};

const RESERVED_KEYS = new Set(["service", "region", "billing", "periods", "quantity", "hours"]);

export function buildRecipe(
  service: string,
  input: { region: string; billing?: string; periods?: number; quantity?: number; hours?: number; [key: string]: unknown },
): { rewriteValue: Record<string, any> } {
  const r = RECIPES[service];
  if (!r) throw invalid(`No recipe for service '${service}'.`, "service", Object.keys(RECIPES).sort());
  const billing = (input.billing ?? "monthly") as BillingMode;
  const periods = input.periods ?? 1;
  const quantity = input.quantity ?? 1;
  const hours = input.hours ?? 730;
  if (!r.modes.includes(billing)) {
    throw invalid(`${service} does not support '${billing}'.`, "billing", [...r.modes]);
  }
  if (quantity !== 1 && !r.quantity) {
    throw invalid(`${service} cannot express quantity on its form.`, "quantity", [1]);
  }
  const options = Object.fromEntries(Object.entries(input).filter(([k, v]) => !RESERVED_KEYS.has(k) && v !== undefined));
  const unknown = Object.keys(options).filter(k => !(k in r.controls)).sort();
  if (unknown.length) {
    throw invalid(`${service} has no option '${unknown[0]}'.`, unknown[0]!, Object.keys(r.controls).sort());
  }
  const [mode, measure] = CHARGE[billing];
  const render: Record<string, unknown> = {};
  for (const [k, controlId] of Object.entries(r.controls)) {
    if (k in options) render[controlId] = options[k];
  }
  const form: Record<string, any> = {
    global_REGIONINFO: { ...(r.regionless ? {} : { region: input.region }), locationType: "commonAZ", chargeMode: mode },
    template_RENDER: render,
  };
  if (billing === "ondemand") {
    if (r.hours) form.global_ONDEMANDTIME = { UNSET_Stepper_0: stepper(4, hours) };
  } else {
    form.global_PERIODTIME = { UNSET_PeriodTime: { measureValue: periods, measureId: measure } };
  }
  if (r.quantity) {
    form.global_QUANTITY = { UNSET_Stepper_0: stepper(41, quantity) };
  }
  return { rewriteValue: form };
}

export const LTS_PAGE_OPTIONS = [
  "flow_gb_per_day",
  "index_percent",
  "retention_days",
  "cold_enabled",
  "hot_retention_days",
  "transfer_basic_gb_per_day",
  "transfer_senior_gb_per_day",
  "months",
] as const;

export function buildLtsForm(input: { region: string; billing?: string; quantity?: number; [key: string]: unknown }): Record<string, any> {
  const billing = input.billing ?? "ondemand";
  const quantity = input.quantity ?? 1;
  const allowedSet = new Set<string>(LTS_PAGE_OPTIONS);
  const extra = Object.keys(input).filter(k => !RESERVED_KEYS.has(k) && !allowedSet.has(k) && input[k] !== undefined).sort();
  if (extra.length) {
    throw invalid("LTS requires daily flow and retention inputs; legacy usage totals are ambiguous.", extra[0]!, [...LTS_PAGE_OPTIONS]);
  }
  if (billing !== "ondemand" || quantity !== 1 || typeof quantity === "boolean") {
    throw invalid("LTS supports one ondemand usage card.", "billing");
  }
  const cold_enabled = input.cold_enabled ?? false;
  if (typeof cold_enabled !== "boolean") {
    throw invalid("cold_enabled must be boolean.", "cold_enabled");
  }
  const flow_gb_per_day = input.flow_gb_per_day ?? 1;
  const index_percent = input.index_percent ?? 100;
  const transfer_basic_gb_per_day = input.transfer_basic_gb_per_day ?? 0;
  const transfer_senior_gb_per_day = input.transfer_senior_gb_per_day ?? 0;
  const numeric: Record<string, unknown> = {
    flow_gb_per_day,
    index_percent,
    transfer_basic_gb_per_day,
    transfer_senior_gb_per_day,
  };
  for (const [key, value] of Object.entries(numeric)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw invalid("LTS inputs must be finite nonnegative numbers.", key);
    }
  }
  const retention_days = input.retention_days ?? 30;
  const hot_retention_days = input.hot_retention_days ?? 30;
  const months = input.months ?? 1;
  const integers: Record<string, unknown> = { retention_days, hot_retention_days, months };
  for (const [key, value] of Object.entries(integers)) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw invalid("LTS retention and duration must be positive integers.", key);
    }
  }
  if ((index_percent as number) > 100) {
    throw invalid("LTS index percentage cannot exceed 100.", "index_percent");
  }
  if (cold_enabled && (hot_retention_days as number) > (retention_days as number)) {
    throw invalid("Hot retention cannot exceed total retention.", "hot_retention_days");
  }
  const render: Record<string, unknown> = {
    calculator_ltsLogFlow_stepper: { UNSET_Stepper_0: stepper(10, flow_gb_per_day as number) },
    calculator_lts_cold_switch: { UNSET_Switch: cold_enabled ? "calc_3_" : "calc_4_" },
    calculator_ltsLogIndexRate_stepper: { UNSET_Stepper_0: stepper(17, index_percent as number) },
    calculator_lts_transfer_basic_stepper: { UNSET_Stepper_0: stepper(10, transfer_basic_gb_per_day as number) },
    calculator_lts_transfer_senior_stepper: { UNSET_Stepper_0: stepper(10, transfer_senior_gb_per_day as number) },
  };
  if (cold_enabled) {
    render.calculator_ltsStorage_stepper = { UNSET_Stepper_0: stepper(17, retention_days as number) };
    render.calculator_ltsHotStorage_stepper = { UNSET_Stepper_0: stepper(17, hot_retention_days as number) };
  } else {
    render.calculator_ltsStorage_normal_stepper = { UNSET_Stepper_0: stepper(17, retention_days as number) };
  }
  return {
    global_REGIONINFO: { region: input.region, locationType: "commonAZ", chargeMode: "ONDEMAND" },
    global_ONDEMANDTIME: { UNSET_Stepper_0: stepper(20, months as number) },
    template_RENDER: render,
  };
}
