import { z } from "zod";

/** The image an ECS card gets when it names none; `plan` checks it the same way the builder does. */
export const ECS_DEFAULT_IMAGE = "AlmaLinux";

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
export const Numeric = z.union([z.number().finite(), z.string().regex(decimal)])
  .pipe(z.coerce.number<string | number>().finite()).describe("A finite decimal number");
export const BooleanInput = z.union([z.boolean(), z.enum(["true", "false"])])
  .transform(value => typeof value === "boolean" ? value : value === "true")
  .describe("Boolean or exact string true/false");
export const Nonempty = z.string().trim().min(1).describe("Nonempty text");
export const PositiveInteger = Numeric.pipe(z.number().int().positive()).describe("Positive integer");
export const Nonnegative = Numeric.pipe(z.number().nonnegative()).describe("Nonnegative finite number");
export const EmptyInput = z.strictObject({});
export const RegionInput = Nonempty.describe("Region ID or friendly region name");
export const Billing = z.enum(["ondemand", "monthly", "yearly"]).describe("Billing mode");
export const CardBilling = z.enum(["ondemand", "monthly", "yearly", "ri"]).describe("Card billing mode; RI is ECS only");
export const QuoteItem = z.strictObject({
  service: Nonempty.describe("Calculator service code"), spec: Nonempty.describe("SKU specification"),
  quantity: PositiveInteger.default(1).describe("Number of resources, default 1"),
  size: Nonnegative.optional().describe("Optional resource size in GB"),
  size_measure_id: Nonnegative.optional().describe("Optional size measure ID"),
  usage_factor: Nonempty.optional().describe("Usage factor; required for on-demand OBS (e.g. size, size_3az, download.external, get, put)"),
  storage_class: z.enum(["standard", "warm", "cold"]).optional().describe("OBS storage class when needed to disambiguate"),
  usage_value: Nonnegative.optional().describe("Usage volume for non-Duration usage_factor"),
  usage_measure_id: Nonnegative.optional().describe("Optional usage measure ID"),
});
export const Disk = z.union([z.tuple([Nonempty, PositiveInteger]), z.strictObject({ type: Nonempty, size: PositiveInteger })])
  .transform(value => Array.isArray(value) ? value : [value.type, value.size] as [string, number])
  .describe("Disk type and positive size in GB");
export const ListReference = z.string().min(1).transform((value, ctx) => {
  let id = value;
  if (value.includes("://")) {
    try {
      const url = new URL(value);
      if (url.origin !== "https://www.huaweicloud.com" || url.pathname !== "/intl/en-us/pricing/calculator.html") throw new Error();
      id = url.searchParams.get("shareListId") ?? "";
    } catch { ctx.addIssue({ code: "custom", message: "Invalid calculator share URL" }); return z.NEVER; }
  }
  if (!/^[a-f\d]+$/i.test(id)) { ctx.addIssue({ code: "custom", message: "Invalid share ID" }); return z.NEVER; }
  return id;
}).describe("Hexadecimal share ID or Huawei calculator share URL");

export const BrowserOptions = z.strictObject({
  headed: z.boolean().default(false).describe("Show the browser window"),
  profile: z.string().min(1).optional().describe("Authentication profile name"),
  executable: z.string().min(1).optional().describe("Chromium executable path"),
  timeout: z.number().positive().finite().default(60000).describe("Request timeout in milliseconds"),
  cacheTtl: z.number().nonnegative().finite().default(86400).describe("Public catalog cache TTL in seconds"),
});

const common = {
  region: RegionInput, quantity: PositiveInteger.default(1).describe("Number of resources, default 1"),
  periods: PositiveInteger.default(1).describe("Number of billing periods"),
  hours: Numeric.pipe(z.number().positive()).default(730).describe("On-demand hours, default 730"),
  title: Nonempty.optional().describe("Optional card title"),
};
const noPeriods = { region: common.region, quantity: common.quantity, hours: common.hours, title: common.title };
const ondemand = z.literal("ondemand").default("ondemand").describe("On-demand billing only");
const standardBilling = (defaultMode: "ondemand" | "monthly" | "yearly") => Billing.default(defaultMode);
const textDefault = (value: string, description: string) => Nonempty.default(value).describe(description);
const volume = (value: number, description: string) => Nonnegative.default(value).describe(description);
const count = (value: number, description: string) => PositiveInteger.default(value).describe(description);
const capacity = (value: number, description: string) => Numeric.pipe(z.number().positive()).default(value).describe(description);
const serviceCode = <T extends string>(value: T) => z.literal(value).describe(`Calculator service code ${value}`);
const ecs = z.strictObject({ service: serviceCode("ecs"), ...common, billing: CardBilling.default("monthly"), flavor: Nonempty,
  image: textDefault(ECS_DEFAULT_IMAGE, "Image name"), system_disk: Disk.default(["GPSSD", 40]), data_disks: z.array(Disk).optional().describe("Data disks in GB"),
  bandwidth_mbit: Nonnegative.optional().describe("Public bandwidth in Mbit/s"), bandwidth_type: textDefault("19_bgp", "Bandwidth type"), ri_time: textDefault("1_3", "Reserved instance term") });
const evs = z.strictObject({ service: serviceCode("evs"), ...common, billing: standardBilling("ondemand"), type: textDefault("GPSSD", "Disk type"), size_gb: count(100, "Disk size in GB"), iops: Nonnegative.optional(), throughput: Nonnegative.optional() });
const cce = z.strictObject({
  service: serviceCode("cce"),
  ...common,
  billing: standardBilling("ondemand"),
  cluster_type: textDefault("standard", "Cluster type: standard, turbo, autopilot"),
  spec: Nonempty.optional().describe("Explicit catalog spec, e.g. cce.s1.small, cce.s2.medium, cce.autopilot.cluster"),
  ha: BooleanInput.default(true).describe("High availability (HA 3-master) for Standard/Turbo clusters"),
  scale: textDefault("small", "Cluster scale: small (50), medium (200), large (1000), xlarge (2000)"),
  vcpus: Nonnegative.optional().describe("Container vCPUs for Autopilot clusters"),
  memory_gb: Nonnegative.optional().describe("Container memory in GiB for Autopilot clusters"),
});
const OBS_PACKAGE_SIZES = ["40gb", "100gb", "500gb", "1tb", "2tb", "5tb", "10tb", "20tb", "50tb", "100tb", "200tb", "300tb", "400tb", "500tb", "1pb", "10pb"] as const;
const OBS_TRAFFIC_SIZES = ["50gb", "100gb", "1tb", "10tb", "30tb", "50tb", "100tb", "200tb", "300tb"] as const;
/** Request lines are typed in the page's own unit (requests per step), 0 to 9,999. */
const OBS_REQUEST_UNIT: Record<string, number> = {
  get: 10000, put: 10000, delete: 1000, transition_warm: 10000, transition_cold: 10000,
  get_warm: 1000, put_warm: 1000, delete_warm: 1000, get_cold: 1000, put_cold: 1000, delete_cold: 1000,
};
const obsComponent = z.strictObject({ factor: Nonempty, value: volume(0, "Usage volume"), unit: z.enum(["GB", "TB"]).optional().describe("Required for storage capacity") });
const obs = z.strictObject({ service: serviceCode("obs"), ...common, billing: standardBilling("ondemand"), components: z.array(obsComponent).optional().describe("OBS usage components; storage uses a 720-hour multiplier"), storage_class: z.enum(["standard", "warm", "cold"]).default("standard").describe("Storage class"), multi_az: BooleanInput.default(false), months: z.number().int().min(1).max(12).default(1).describe("Storage duration in months (pay-per-use usage cards)"), package: z.enum(OBS_PACKAGE_SIZES).optional().describe("Prepaid storage package size; with multi_az it is the multi-AZ package"), traffic_package: z.enum([...OBS_TRAFFIC_SIZES, "none"]).optional().describe("Outbound traffic package; default 50gb where the region sells it, none to leave it out") });
const rds = z.strictObject({ service: serviceCode("rds"), ...common, billing: standardBilling("ondemand"), flavor: Nonempty, storage_spec: Nonempty.optional().describe("Volume SKU; defaults to the engine's Cloud SSD (or common) volume"), volume_type: Nonempty.optional().describe("Alias for storage_spec"), storage_gb: capacity(40, "Storage size in GB"), db_version: Nonempty.optional() });
const sfs = z.strictObject({ service: serviceCode("sfsturbo"), ...common, billing: standardBilling("yearly"), tier: textDefault("20MBps", "Throughput tier"), size_gb: capacity(3686.4, "Storage size in GB") });
const elb = z.strictObject({
  service: serviceCode("elb"), ...common, quantity: PositiveInteger.pipe(z.literal(1)).default(1), billing: standardBilling("ondemand"),
  type: z.enum(["shared", "dedicated"]).default("shared").optional().describe("Load balancer type"),
  flavor: Nonempty.optional().describe("Dedicated load balancer flavor/specification, e.g. elbv3.professional or elbv3.basic.1az"),
  spec: Nonempty.optional().describe("Alias for flavor"),
  az_type: z.enum(["single", "multi"]).default("single").optional().describe("Availability zone placement: single or multi"),
  protocol: z.enum(["tcp", "udp", "tls"]).default("tcp").optional().describe("Network protocol type for L4: tcp, udp, or tls"),
  public_ip_count: Nonnegative.pipe(z.number().int().min(1).max(2)).default(2).optional().describe("Network type selector of the shared load balancer page (1 or 2)"),
  l4_lcu: Nonnegative.optional().describe("Network load balancing LCUs (dedicated ELB)"),
  l7_lcu: Nonnegative.optional().describe("Application load balancing LCUs (dedicated ELB)"),
  lcu: Nonnegative.optional().describe("Alias for l4_lcu"),
});
const nat = z.strictObject({ service: serviceCode("nat"), ...common, billing: standardBilling("ondemand"), size: textDefault("small", "Gateway size"), nat_type: z.enum(["public", "private"]).default("public").optional().describe("NAT gateway type: public or private") });
const apig = z.strictObject({ service: serviceCode("apig"), ...common, billing: standardBilling("ondemand"), edition: textDefault("BASIC", "API Gateway edition"), bandwidth_mbps: Nonnegative.pipe(z.number().int().min(0).max(2000)).default(0).optional().describe("Public outbound access bandwidth in Mbit/s") });
const dline = z.strictObject({ service: serviceCode("dline"), ...common, billing: standardBilling("monthly"), port: textDefault("1ge", "Port type") });
const cbr = z.strictObject({ service: serviceCode("cbr"), ...common, quantity: PositiveInteger.pipe(z.literal(1)).default(1), billing: standardBilling("yearly"), vault_spec: textDefault("vault.backup.server.normal", "Vault specification"), size_gb: capacity(100, "Vault size in GB") });
const apm = z.strictObject({ service: serviceCode("apm"), ...noPeriods, billing: ondemand, spec: textDefault("apm2.instance.normal", "APM specification"), probes: count(1, "Number of probe instances").optional() });
const waf = z.strictObject({ service: serviceCode("waf"), ...noPeriods, billing: ondemand, domains: volume(1, "Domains"), rules: volume(1, "Rules"), requests: volume(1000000, "Requests") });
const functionGraph = z.strictObject({ service: serviceCode("function"), ...noPeriods, billing: ondemand, requests: volume(1000000, "Requests"), gb_seconds: volume(400000, "GB-seconds"), memory_mb: count(128, "Memory in MB"), compute_units: volume(100, "Compute units"), request_units: volume(100, "Request units") });
const dew = z.strictObject({ service: serviceCode("dew"), ...noPeriods, billing: ondemand, keys: volume(1, "Keys"), api_requests: volume(1, "API requests"), days: volume(30, "Days"), storage_spec: textDefault("kms.ud.customer", "Storage specification"), api_spec: textDefault("kms.api", "API specification") });
const lts = z.strictObject({ service: serviceCode("lts"), ...noPeriods, billing: ondemand, flow_gb: volume(0, "Flow GB"), index_gb: volume(0, "Index GB"), cold_mb: volume(0, "Cold storage MB"), storage_mb: volume(0, "Storage MB"), transfer_basic_gb: volume(0, "Basic transfer GB"), transfer_senior_gb: volume(0, "Senior transfer GB"), knobs: z.record(z.string(), Numeric).optional().describe("Display knob overrides") });
const cci = z.strictObject({ service: serviceCode("cci"), region: RegionInput, hours: common.hours, title: common.title, billing: ondemand, vcpu: count(1, "vCPUs"), mem_gb: Numeric.pipe(z.number().positive()).default(2).describe("Memory GB") });
const DmsStorageType = z.enum(["high", "ultra", "high-io", "ultra-high-io"]).optional().describe("Storage type (high or ultra)");
const rabbitmq = z.strictObject({ service: serviceCode("rabbitmq"), ...common, billing: standardBilling("monthly"), spec_id: textDefault("c6.2u4g.single", "RabbitMQ specification"), storage_gb: capacity(100, "Storage GB"), brokers: count(1, "Broker count"), version: textDefault("3.8", "RabbitMQ version"), storage_type: DmsStorageType });
const kafka = z.strictObject({ service: serviceCode("kafka"), ...common, billing: standardBilling("monthly"), spec_id: textDefault("kafka.2u4g.single.small", "Kafka specification"), storage_gb: capacity(100, "Storage GB"), brokers: count(1, "Broker count"), storage_type: DmsStorageType });
const nosql = z.strictObject({ service: serviceCode("nosql"), region: RegionInput, periods: common.periods, hours: common.hours, title: common.title, billing: standardBilling("monthly"), flavor: textDefault("large.4", "Instance flavor"), nodes: count(2, "Node count"), storage_gb: capacity(100, "Storage GB"), engine: textDefault("dynamodb", "Database engine") });
const eip = z.strictObject({
  service: serviceCode("eip"), ...common, billing: standardBilling("ondemand"),
  eip_count: PositiveInteger.optional().describe("Public IP count"),
  ip_quantity: PositiveInteger.optional().describe("Public IP count"),
  traffic_gb: volume(0, "Outbound traffic in GB").optional(),
  bandwidth_mbps: Numeric.pipe(z.number().positive()).optional().describe("Bandwidth in Mbit/s"),
  share_type: z.enum(["dedicated", "shared"]).default("dedicated").optional().describe("Bandwidth share type"),
  billed_by: z.enum(["bandwidth", "traffic"]).optional().describe("EIP billing metric"),
  ip_reservation: BooleanInput.default(true).describe("Reserve the public IP"),
});
const redis = z.strictObject({ service: serviceCode("redis"), ...common, billing: standardBilling("ondemand"), spec: textDefault("redis.single.xu1.large.4", "Redis specification"), bandwidth_mbit: Numeric.pipe(z.number().positive()).optional().describe("Additional bandwidth in Mbit/s") });
export const CardInput = z.discriminatedUnion("service", [ecs, evs, cce, obs, rds, sfs, elb, nat, apig, dline, cbr, apm, waf, functionGraph, dew, lts, cci, rabbitmq, kafka, nosql, eip, redis])
  .superRefine((card, ctx) => {
    if (["obs", "apm", "waf", "eip"].includes(card.service) && "quantity" in card && card.quantity !== 1) ctx.addIssue({ code: "custom", path: ["quantity"], message: "This service cannot apply quantity; use separate cards or its service-specific count" });
    if ("periods" in card && (card.billing === "ondemand" || card.billing === "ri") && card.periods !== 1) ctx.addIssue({ code: "custom", path: ["periods"], message: "This billing mode does not use billing periods" });
    if ("hours" in card && card.billing !== "ondemand" && card.hours !== 730) ctx.addIssue({ code: "custom", path: ["hours"], message: "Hours apply only to on-demand billing" });
    // The page's duration selector offers 1 to 9 months or 1 year (verified live on ECS, 2026-11-07).
    if (card.service === "ecs" && ((card.billing === "monthly" && card.periods > 9) || (card.billing === "yearly" && card.periods > 1))) ctx.addIssue({ code: "custom", path: ["periods"], message: "ECS monthly billing allows 1 to 9 periods and yearly billing 1" });
    if (card.service === "elb") {
      if (card.type === "dedicated" && card.billing !== "ondemand") ctx.addIssue({ code: "custom", path: ["billing"], message: "Dedicated ELB only supports on-demand billing" });
      if (card.type === "shared" && (card.l4_lcu !== undefined || card.l7_lcu !== undefined || card.lcu !== undefined)) ctx.addIssue({ code: "custom", message: "LCU options apply only to dedicated ELB" });
    }
    if (card.service === "eip") {
      if (card.ip_quantity !== undefined && card.eip_count !== undefined && card.ip_quantity !== card.eip_count) {
        ctx.addIssue({ code: "custom", message: "Conflicting EIP count aliases: ip_quantity and eip_count must be equal if both are supplied" });
      }
      if (card.bandwidth_mbps !== undefined && card.traffic_gb !== undefined && card.traffic_gb > 0) {
        ctx.addIssue({ code: "custom", message: "EIP cannot specify both bandwidth_mbps and positive traffic_gb; choose either bandwidth or traffic billing" });
      }
      const countVal = card.ip_quantity ?? card.eip_count ?? 1;
      if (!card.ip_reservation && countVal !== 1) ctx.addIssue({ code: "custom", path: ["eip_count"], message: "EIP count requires IP reservation" });
      // The calculator page always adds the public IP line (checked live 2026-11-07), so a traffic-only card cannot be encoded.
      if (!card.ip_reservation) ctx.addIssue({ code: "custom", path: ["ip_reservation"], message: "The calculator always includes the public IP line; ip_reservation cannot be false" });
      if (card.billing !== "ondemand" && card.bandwidth_mbps === undefined) ctx.addIssue({ code: "custom", path: ["bandwidth_mbps"], message: "EIP monthly or yearly billing requires bandwidth_mbps" });
      if (card.billed_by === "traffic" && card.billing !== "ondemand") ctx.addIssue({ code: "custom", path: ["billing"], message: "EIP billed by traffic only supports on-demand billing" });
      if (card.billed_by === "traffic" && card.bandwidth_mbps !== undefined) ctx.addIssue({ code: "custom", path: ["bandwidth_mbps"], message: "EIP billed by traffic cannot specify bandwidth_mbps" });
      if (card.billed_by === "bandwidth" && card.traffic_gb !== undefined && card.traffic_gb > 0) ctx.addIssue({ code: "custom", path: ["traffic_gb"], message: "EIP billed by bandwidth cannot specify traffic_gb" });
      if (card.billed_by === "traffic" && card.traffic_gb === 0 && !card.ip_reservation) ctx.addIssue({ code: "custom", message: "EIP requires traffic or IP reservation" });
    }
    if (card.service === "evs" && (card.iops !== undefined || card.throughput !== undefined) && (card.billing !== "ondemand" || !["GPSSD2", "ESSD2"].includes(card.type))) ctx.addIssue({ code: "custom", message: "IOPS and throughput apply only to on-demand GPSSD2 or ESSD2 volumes" });
    if (card.service === "ecs" && card.billing !== "ri" && card.ri_time !== "1_3") ctx.addIssue({ code: "custom", path: ["ri_time"], message: "RI term requires reserved-instance billing" });
    if (card.service === "ecs" && (card.bandwidth_mbit === undefined || card.bandwidth_mbit === 0) && !["19_bgp", "12_bgp"].includes(card.bandwidth_type)) ctx.addIssue({ code: "custom", path: ["bandwidth_type"], message: "Bandwidth type requires bandwidth" });
    if (card.service === "sfsturbo" && Math.abs(card.size_gb * 10 / 1024 - Math.round(card.size_gb * 10 / 1024)) > 1e-9) ctx.addIssue({ code: "custom", path: ["size_gb"], message: "SFS Turbo capacity must be representable in 0.1 TB increments" });
    // The calculator page clamps these fields silently when a card is opened in Edit, so a larger value would re-price differently there (issue #6.3).
    if (card.service === "dew") {
      if (card.keys > 99) ctx.addIssue({ code: "custom", path: ["keys"], message: "DEW keys or secrets are limited to 99 per card by the calculator page; split them across cards" });
      if (card.api_requests > 9999) ctx.addIssue({ code: "custom", path: ["api_requests"], message: "DEW API requests are limited to 9,999 per card by the calculator page; split them across cards" });
    }
    if (card.service === "obs") {
      if (card.storage_class === "cold" && card.multi_az && !card.package) ctx.addIssue({ code: "custom", path: ["multi_az"], message: "Cold multi-AZ capacity is not supported" });
      const nonSizeFactors = new Set([
        "download.external", "download_warm.external", "download_cold.external", "get", "put",
        "get_warm", "put_warm", "delete_warm", "get_cold", "put_cold", "delete_cold", "delete",
        "download.cdn", "download_crr", "retrieval_size_warm", "restore_size_ex", "restore_size_sd", "retrieval_size_cold", "transition_warm", "transition_cold",
      ]);
      const seenFactors = new Set<string>();
      for (const [index, component] of (card.components ?? []).entries()) {
        if (seenFactors.has(component.factor)) ctx.addIssue({ code: "custom", path: ["components", index, "factor"], message: "Duplicate OBS usage factor" });
        seenFactors.add(component.factor);
        if (component.factor.startsWith("size")) {
          if (!component.unit) ctx.addIssue({ code: "custom", path: ["components", index, "unit"], message: "Storage capacity requires GB or TB" });
          else if (component.value > 102400) ctx.addIssue({ code: "custom", path: ["components", index, "value"], message: "OBS storage is limited to 102,400 (in the chosen unit) per card by the calculator page; split it across cards" });
          const expected = { standard: card.multi_az ? "size_3az" : "size", warm: card.multi_az ? "size_warm_3az" : "size_warm", cold: "size_cold" }[card.storage_class];
          if (component.factor !== expected || (card.storage_class === "cold" && card.multi_az)) ctx.addIssue({ code: "custom", path: ["components", index, "factor"], message: "Storage factor must match storage class and availability zone" });
        } else {
          if (!nonSizeFactors.has(component.factor)) ctx.addIssue({ code: "custom", path: ["components", index, "factor"], message: "Unknown or incompatible OBS usage factor" });
          const requestUnit = OBS_REQUEST_UNIT[component.factor];
          if (requestUnit) {
            if (!Number.isInteger(component.value) || component.value > 9999) ctx.addIssue({ code: "custom", path: ["components", index, "value"], message: `OBS ${component.factor} is counted in units of ${requestUnit.toLocaleString("en-US")} requests, a whole number up to 9,999` });
          } else if (component.factor === "download_crr" ? component.value > 9_999_999 : component.value > 102_400) ctx.addIssue({ code: "custom", path: ["components", index, "value"], message: `OBS ${component.factor} is limited to ${component.factor === "download_crr" ? "9,999,999" : "102,400"} GB per card by the calculator page; split it across cards` });
          const expectedClass = component.factor.includes("warm") ? "warm" : component.factor.includes("cold") || component.factor.startsWith("restore_size") ? "cold" : "standard";
          if (!["download.cdn", "download_crr"].includes(component.factor) && card.storage_class !== expectedClass) {
            ctx.addIssue({ code: "custom", path: ["components", index, "factor"], message: "OBS usage factor does not match storage_class" });
          }
        }
      }
      if (!card.package && !card.components?.length) ctx.addIssue({ code: "custom", message: "OBS requires a package or at least one component" });
      if (card.package && card.storage_class !== "standard") ctx.addIssue({ code: "custom", path: ["storage_class"], message: "OBS packages are sold for Standard storage only" });
      if (card.months > 1 && card.billing !== "ondemand") ctx.addIssue({ code: "custom", path: ["months"], message: "months applies to pay-per-use usage cards" });
      if (card.traffic_package && !card.package) ctx.addIssue({ code: "custom", path: ["traffic_package"], message: "traffic_package needs a storage package" });
      if (card.package && card.billing === "ondemand") ctx.addIssue({ code: "custom", message: "OBS packages require monthly or yearly billing" });
      if (card.package && card.components?.length) ctx.addIssue({ code: "custom", message: "OBS package and usage components cannot be combined" });
    }
  });
export type CardInput = z.output<typeof CardInput>;

export const CurrencyCode = z.string().trim().regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter code (e.g. USD, BRL)")
  .transform(value => value.toUpperCase()).describe("3-letter currency code (e.g. USD, BRL)");

function buildInputSchemas(mcp: boolean) {
  const num = mcp ? z.number().finite().describe("Finite number") : Numeric;
  const posInt = mcp ? z.number().int().positive().describe("Positive integer") : PositiveInteger;
  const nonneg = mcp ? z.number().nonnegative().describe("Nonnegative number") : Nonnegative;
  const posNum = (mcp ? z.number().positive().finite() : Numeric.pipe(z.number().positive()));
  const bool = mcp ? z.boolean().describe("Boolean") : BooleanInput;
  const quoteItem = z.strictObject({
    service: Nonempty.describe("Calculator service code"),
    spec: Nonempty.describe("SKU specification"),
    quantity: posInt.default(1).describe("Number of resources, default 1"),
    size: nonneg.optional().describe("Optional resource size in GB"),
    size_measure_id: nonneg.optional().describe("Optional size measure ID"),
    usage_factor: Nonempty.optional().describe("Usage factor; required for on-demand OBS (e.g. size, size_3az, download.external, get, put)"),
    storage_class: z.enum(["standard", "warm", "cold"]).optional().describe("OBS storage class when needed to disambiguate"),
    usage_value: nonneg.optional().describe("Usage volume for non-Duration usage_factor"),
    usage_measure_id: nonneg.optional().describe("Optional usage measure ID"),
  });
  const requirement = z.strictObject({
    id: Nonempty.describe("Unique requirement ID"),
    service: Nonempty.describe("Service code (see list_services)"),
    region: RegionInput,
    billing: CardBilling.describe("Billing mode (ri is ECS only)"),
    quantity: posInt.default(1).describe("Resource count, default 1"),
    needs: z.strictObject({
      vcpus: nonneg.optional().describe("Minimum vCPUs"),
      memory_gb: nonneg.optional().describe("Minimum memory in GB"),
    }).optional().describe("Sizing constraints for auto-matching a SKU"),
    spec: Nonempty.optional().describe("Explicit SKU spec code"),
    group: Nonempty.optional().describe("Catalog group filter"),
    options: z.record(z.string(), z.unknown()).optional().describe("Service options from autocalc://schema/<service>"),
  });
  return {
    ListServicesInput: z.strictObject({
      query: z.string().default("").describe("Optional service search text"),
      publishable_only: bool.default(false).describe("When true, return only publish-verified services with billing modes and options"),
    }),
    ListRegionsInput: z.strictObject({
      service: z.string().default("").describe("Optional service code"),
      query: z.string().default("").describe("Optional region ID or friendly name filter (e.g. Santiago, Brazil)"),
    }),
    SearchInput: z.strictObject({
      service: Nonempty.describe("Calculator service code"),
      region: RegionInput,
      query: z.string().default("").describe("Search terms"),
      billing: Billing.optional().describe("Filter by billing mode"),
      min_vcpus: nonneg.optional().describe("Minimum vCPUs"),
      min_memory_gb: nonneg.optional().describe("Minimum memory in GB"),
      limit: posInt.default(30).describe("Maximum results, default 30"),
      refresh: bool.default(false).describe("Bypass catalog cache and mirror"),
    }),
    DescribeInput: z.strictObject({
      service: Nonempty.describe("Calculator service code"),
      region: mcp ? RegionInput : RegionInput.default("sa-brazil-1").describe("Region ID or friendly region name, default sa-brazil-1"),
      group: Nonempty.optional().describe("Optional catalog group to show more sample specs for"),
    }),
    QuoteInput: z.strictObject({
      region: RegionInput,
      items: z.array(quoteItem).min(1).describe("Items to price"),
      billing: Billing.default("ondemand").describe("Billing mode, default ondemand"),
      hours: posNum.default(730).describe("On-demand hours; default 730"),
      periods: posInt.default(1).describe("Number of billing periods, default 1"),
    }),
    ConvertInput: z.strictObject({
      amount_usd: num.describe("USD amount, may be negative"),
      currency: CurrencyCode,
    }),
    CompareModesInput: z.strictObject({
      items: z.array(quoteItem).min(1).describe("Items to compare"),
      modes: z.array(Billing).default(["ondemand", "monthly", "yearly"]).describe("Billing modes to compare"),
      region: mcp ? RegionInput : RegionInput.default("sa-brazil-1").describe("Region ID or friendly region name, default sa-brazil-1"),
      currency: CurrencyCode.default("USD").describe("3-letter target currency code, default USD"),
      hours: posNum.default(730).describe("Monthly on-demand usage in hours; default 730"),
      periods: posInt.default(1).describe("Number of months or years for monthly/yearly, default 1"),
    }),
    CompareRegionsInput: z.strictObject({
      items: z.array(quoteItem).min(1).describe("Items to compare"),
      regions: z.array(RegionInput).min(1).describe("Region IDs or friendly names"),
      billing: Billing.default("monthly").describe("Billing mode, default monthly"),
    }),
    ListMyPriceListsInput: z.strictObject({
      query: z.string().default("").describe("Optional filter on list name or ID"),
      limit: (mcp ? posInt.default(20) : posInt.optional()).describe("Maximum lists to return"),
    }),
    ListReferenceInput: z.strictObject({ url_or_id: ListReference }),
    RenameListInput: z.strictObject({ url_or_id: ListReference, new_name: Nonempty.max(50).describe("New list name, 1 to 50 characters") }),
    DuplicateListInput: z.strictObject({ url_or_id: ListReference, new_name: Nonempty.max(50).optional().describe("Optional copy name, 1 to 50 characters") }),
    DraftQuoteInput: z.strictObject({
      customer: Nonempty.describe("Customer label"),
      requirements: z.array(requirement).min(1).describe("Requirements to resolve into SKUs"),
    }),
    ReviseQuoteInput: z.strictObject({
      draft_id: Nonempty.describe("Draft id"),
      decisions: z.array(z.strictObject({
        requirement_id: Nonempty.describe("Requirement id"),
        spec: Nonempty.describe("Chosen SKU spec"),
        justification: Nonempty.describe("Why this spec"),
      })).min(1).describe("Chosen SKUs for pending requirements"),
    }),
    DraftIdInput: z.strictObject({ draft_id: Nonempty.describe("Draft id") }),
    InspectDraftInput: z.strictObject({
      draft_id: Nonempty.optional().describe("Draft id; omit to list recent local drafts"),
      limit: posInt.default(20).describe("Maximum drafts to list when draft_id is omitted, default 20"),
    }),
    PublishQuoteInput: z.strictObject({
      draft_id: Nonempty.describe("Draft id"),
      name: Nonempty.max(50).describe("Saved list name, 1 to 50 characters"),
      settlement: z.enum(["total", "monthly"]).default("total").describe("Settlement display, default total"),
      currency: CurrencyCode.default("USD").describe("Share link currency, default USD"),
    }),
    RecoverDraftInput: z.strictObject({
      draft_id: Nonempty.describe("Draft id"),
      confirmed_no_remote_list: bool.describe("True only after confirming via list_my_price_lists that no remote list was created"),
      justification: Nonempty.describe("How you reconciled with remote saved lists"),
    }),
    CompileQuoteInput: z.strictObject({ path: Nonempty.describe("Path of the declarative quote YAML file") }),
    PlanQuoteInput: z.strictObject({ path: Nonempty.describe("Path of the quote YAML file (version '1' preferred)") }),
    ApplyQuoteInput: z.strictObject({
      path: Nonempty.describe("Path of the planned quote YAML file"),
      name: Nonempty.max(50).optional().describe("Override saved list name (1-50 chars); defaults to file metadata/name"),
    }),
    ExportQuotesXlsxInput: z.strictObject({
      rows: z.array(z.strictObject({
        env: Nonempty.describe("Environment label"),
        list: ListReference,
        draft_id: Nonempty.optional().describe("Optional draft id for decision audit sheet"),
      })).min(1).describe("Rows of {env, list, draft_id?} in display order"),
      path: Nonempty.optional().describe("Output .xlsx path; default creates a unique file in exports directory"),
    }),
  };
}

const McpQuoteItem = z.strictObject({
  service: Nonempty.describe("Calculator service code"),
  spec: Nonempty.describe("SKU specification"),
  quantity: z.number().int().positive().default(1).describe("Number of resources, default 1"),
  size: z.number().nonnegative().finite().optional().describe("Optional resource size in GB"),
  usage_factor: Nonempty.optional().describe("Usage factor; required for on-demand OBS (e.g. size, size_3az, download.external, get, put)"),
  storage_class: z.enum(["standard", "warm", "cold"]).optional().describe("OBS storage class when needed to disambiguate"),
  usage_value: z.number().nonnegative().finite().optional().describe("Usage volume for non-Duration usage_factor"),
});

const cliSchemas = {
  ...buildInputSchemas(false),
  LoginInput: z.strictObject({
    wait_seconds: Numeric.pipe(z.number().positive()).default(45).describe("Seconds to wait for sign-in; keeps running up to 5 minutes"),
    timeout: Numeric.pipe(z.number().positive()).optional().describe("CLI only: block until sign-in finishes or this many seconds pass"),
  }),
};
export const mcpSchemas = {
  ...buildInputSchemas(true),
  QuoteInput: z.strictObject({
    region: RegionInput,
    items: z.array(McpQuoteItem).min(1).describe("Items to price"),
    billing: Billing.default("ondemand").describe("Billing mode, default ondemand"),
    hours: z.number().positive().finite().default(730).describe("On-demand hours; default 730"),
    periods: z.number().int().positive().default(1).describe("Number of billing periods, default 1"),
  }),
  CompareModesInput: z.strictObject({
    items: z.array(McpQuoteItem).min(1).describe("Items to compare"),
    modes: z.array(Billing).default(["ondemand", "monthly", "yearly"]).describe("Billing modes to compare"),
    region: RegionInput,
    currency: CurrencyCode.default("USD").describe("3-letter target currency code, default USD"),
    hours: z.number().positive().finite().default(730).describe("Monthly on-demand usage in hours; default 730"),
    periods: z.number().int().positive().default(1).describe("Number of months or years for monthly/yearly, default 1"),
  }),
  CompareRegionsInput: z.strictObject({
    items: z.array(McpQuoteItem).min(1).describe("Items to compare"),
    regions: z.array(RegionInput).min(1).describe("Region IDs or friendly names"),
    billing: Billing.default("monthly").describe("Billing mode, default monthly"),
  }),
  LoginInput: z.strictObject({
    wait_seconds: z.number().positive().finite().default(45).describe("Seconds to wait for sign-in; keeps running up to 5 minutes"),
  }),
};

export const {
  ListServicesInput,
  ListRegionsInput,
  SearchInput,
  DescribeInput,
  QuoteInput,
  ConvertInput,
  CompareModesInput,
  CompareRegionsInput,
  ListMyPriceListsInput,
  ListReferenceInput,
  RenameListInput,
  DuplicateListInput,
  LoginInput,
  DraftQuoteInput,
  ReviseQuoteInput,
  DraftIdInput,
  InspectDraftInput,
  PublishQuoteInput,
  RecoverDraftInput,
  CompileQuoteInput,
  PlanQuoteInput,
  ApplyQuoteInput,
  ExportQuotesXlsxInput,
} = cliSchemas;
