import { z } from "zod";

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
  size: Nonnegative.optional().describe("Optional resource size"),
  size_measure_id: Nonnegative.optional().describe("Optional size measure ID"),
  usage_factor: Nonempty.optional().describe("Optional usage factor"),
  storage_class: z.enum(["standard", "warm", "cold"]).optional().describe("OBS storage class when needed to disambiguate"),
  usage_value: Nonnegative.optional().describe("Optional usage volume"),
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
  image: textDefault("AlmaLinux", "Image name"), system_disk: Disk.default(["GPSSD", 40]), data_disks: z.array(Disk).optional().describe("Data disks in GB"),
  bandwidth_mbit: Nonnegative.optional().describe("Public bandwidth in Mbit/s"), bandwidth_type: textDefault("19_bgp", "Bandwidth type"), ri_time: textDefault("1_3", "Reserved instance term") });
const evs = z.strictObject({ service: serviceCode("evs"), ...common, billing: standardBilling("ondemand"), type: textDefault("GPSSD", "Disk type"), size_gb: count(100, "Disk size in GB"), iops: Nonnegative.optional(), throughput: Nonnegative.optional() });
const cce = z.strictObject({ service: serviceCode("cce"), ...common, billing: standardBilling("ondemand"), cluster_type: textDefault("standard", "Cluster type"), ha: BooleanInput.default(true), scale: textDefault("small", "Cluster scale") });
const obsComponent = z.strictObject({ factor: Nonempty, value: volume(0, "Usage volume"), unit: z.enum(["GB", "TB"]).optional().describe("Required for storage capacity") });
const obs = z.strictObject({ service: serviceCode("obs"), ...common, billing: standardBilling("ondemand"), components: z.array(obsComponent).optional().describe("OBS usage components; storage uses a 720-hour multiplier"), storage_class: z.enum(["standard", "warm", "cold"]).default("standard").describe("Storage class"), multi_az: BooleanInput.default(false), package: Nonempty.optional() });
const rds = z.strictObject({ service: serviceCode("rds"), ...common, billing: standardBilling("ondemand"), flavor: Nonempty, storage_spec: Nonempty, storage_gb: capacity(40, "Storage size in GB"), db_version: Nonempty.optional() });
const sfs = z.strictObject({ service: serviceCode("sfsturbo"), ...common, billing: standardBilling("yearly"), tier: textDefault("20MBps", "Throughput tier"), size_gb: capacity(512, "Storage size in GB") });
const elb = z.strictObject({ service: serviceCode("elb"), ...common, quantity: PositiveInteger.pipe(z.literal(1)).default(1), billing: standardBilling("ondemand"), public_ip_count: volume(2, "Public IP count") });
const nat = z.strictObject({ service: serviceCode("nat"), ...noPeriods, billing: ondemand, size: textDefault("small", "Gateway size") });
const apig = z.strictObject({ service: serviceCode("apig"), ...common, billing: standardBilling("ondemand"), edition: textDefault("BASIC", "API Gateway edition") });
const dline = z.strictObject({ service: serviceCode("dline"), ...common, billing: standardBilling("monthly"), port: textDefault("1ge", "Port type") });
const cbr = z.strictObject({ service: serviceCode("cbr"), ...common, billing: standardBilling("yearly"), vault_spec: textDefault("vault.backup.server.normal", "Vault specification"), size_gb: capacity(100, "Vault size in GB") });
const apm = z.strictObject({ service: serviceCode("apm"), ...noPeriods, billing: ondemand, spec: textDefault("apm2.instance.normal", "APM specification") });
const waf = z.strictObject({ service: serviceCode("waf"), ...noPeriods, billing: ondemand, domains: volume(1, "Domains"), rules: volume(1, "Rules"), requests: volume(1000000, "Requests") });
const functionGraph = z.strictObject({ service: serviceCode("function"), ...noPeriods, billing: ondemand, requests: volume(1000000, "Requests"), gb_seconds: volume(400000, "GB-seconds"), memory_mb: count(128, "Memory in MB"), compute_units: volume(100, "Compute units"), request_units: volume(100, "Request units") });
const dew = z.strictObject({ service: serviceCode("dew"), ...noPeriods, billing: ondemand, keys: volume(1, "Keys"), api_requests: volume(1, "API requests"), days: volume(30, "Days"), storage_spec: textDefault("kms.ud.customer", "Storage specification"), api_spec: textDefault("kms.api", "API specification") });
const lts = z.strictObject({ service: serviceCode("lts"), ...noPeriods, billing: ondemand, flow_gb: volume(0, "Flow GB"), index_gb: volume(0, "Index GB"), cold_mb: volume(0, "Cold storage MB"), storage_mb: volume(0, "Storage MB"), transfer_basic_gb: volume(0, "Basic transfer GB"), transfer_senior_gb: volume(0, "Senior transfer GB"), knobs: z.record(z.string(), Numeric).optional().describe("Display knob overrides") });
const cci = z.strictObject({ service: serviceCode("cci"), region: RegionInput, hours: common.hours, title: common.title, billing: ondemand, vcpu: count(1, "vCPUs"), mem_gb: Numeric.pipe(z.number().positive()).default(2).describe("Memory GB") });
const rabbitmq = z.strictObject({ service: serviceCode("rabbitmq"), ...common, billing: standardBilling("monthly"), spec_id: textDefault("c6.2u4g.single", "RabbitMQ specification"), storage_gb: capacity(100, "Storage GB"), brokers: count(1, "Broker count"), version: textDefault("3.8", "RabbitMQ version") });
const kafka = z.strictObject({ service: serviceCode("kafka"), ...common, billing: standardBilling("monthly"), spec_id: textDefault("kafka.2u4g.single.small", "Kafka specification"), storage_gb: capacity(100, "Storage GB"), brokers: count(1, "Broker count") });
const nosql = z.strictObject({ service: serviceCode("nosql"), region: RegionInput, periods: common.periods, hours: common.hours, title: common.title, billing: standardBilling("monthly"), flavor: textDefault("large.4", "Instance flavor"), nodes: count(2, "Node count"), storage_gb: capacity(100, "Storage GB"), engine: textDefault("dynamodb", "Database engine") });
const eip = z.strictObject({ service: serviceCode("eip"), ...common, billing: ondemand, eip_count: count(1, "Public IP count"), traffic_gb: volume(0, "Outbound traffic in GB"), ip_reservation: BooleanInput.default(true).describe("Reserve the public IP") });
const redis = z.strictObject({ service: serviceCode("redis"), ...common, billing: standardBilling("ondemand"), spec: textDefault("redis.single.xu1.large.4", "Redis specification"), bandwidth_mbit: Numeric.pipe(z.number().positive()).optional().describe("Additional bandwidth in Mbit/s") });
export const CardInput = z.discriminatedUnion("service", [ecs, evs, cce, obs, rds, sfs, elb, nat, apig, dline, cbr, apm, waf, functionGraph, dew, lts, cci, rabbitmq, kafka, nosql, eip, redis])
  .superRefine((card, ctx) => {
    if (["obs", "apm", "waf", "eip"].includes(card.service) && "quantity" in card && card.quantity !== 1) ctx.addIssue({ code: "custom", path: ["quantity"], message: "This service cannot apply quantity; use separate cards or its service-specific count" });
    if ("periods" in card && (card.billing === "ondemand" || card.billing === "ri") && card.periods !== 1) ctx.addIssue({ code: "custom", path: ["periods"], message: "This billing mode does not use billing periods" });
    if ("hours" in card && card.billing !== "ondemand" && card.hours !== 730) ctx.addIssue({ code: "custom", path: ["hours"], message: "Hours apply only to on-demand billing" });
    if (card.service === "eip" && !card.ip_reservation && card.eip_count !== 1) ctx.addIssue({ code: "custom", path: ["eip_count"], message: "EIP count requires IP reservation" });
    if (card.service === "evs" && (card.iops !== undefined || card.throughput !== undefined) && (card.billing !== "ondemand" || !["GPSSD2", "ESSD2"].includes(card.type))) ctx.addIssue({ code: "custom", message: "IOPS and throughput apply only to on-demand GPSSD2 or ESSD2 volumes" });
    if (card.service === "ecs" && card.billing !== "ri" && card.ri_time !== "1_3") ctx.addIssue({ code: "custom", path: ["ri_time"], message: "RI term requires reserved-instance billing" });
    if (card.service === "ecs" && (card.bandwidth_mbit === undefined || card.bandwidth_mbit === 0) && !["19_bgp", "12_bgp"].includes(card.bandwidth_type)) ctx.addIssue({ code: "custom", path: ["bandwidth_type"], message: "Bandwidth type requires bandwidth" });
    if (card.service === "eip" && !card.ip_reservation && card.traffic_gb === 0) ctx.addIssue({ code: "custom", message: "EIP requires traffic or IP reservation" });
    if (card.service === "sfsturbo" && Math.abs(card.size_gb * 10 / 1024 - Math.round(card.size_gb * 10 / 1024)) > 1e-9) ctx.addIssue({ code: "custom", path: ["size_gb"], message: "SFS Turbo capacity must be representable in 0.1 TB increments" });
    if (card.service === "obs") {
      if (card.storage_class === "cold" && card.multi_az && !card.package) ctx.addIssue({ code: "custom", path: ["multi_az"], message: "Cold multi-AZ capacity is not supported" });
      const seenFactors = new Set<string>();
      for (const [index, component] of (card.components ?? []).entries()) {
        if (seenFactors.has(component.factor)) ctx.addIssue({ code: "custom", path: ["components", index, "factor"], message: "Duplicate OBS usage factor" });
        seenFactors.add(component.factor);
        if (component.factor.startsWith("size")) {
          if (!component.unit) ctx.addIssue({ code: "custom", path: ["components", index, "unit"], message: "Storage capacity requires GB or TB" });
          const expected = { standard: card.multi_az ? "size_3az" : "size", warm: card.multi_az ? "size_warm_3az" : "size_warm", cold: "size_cold" }[card.storage_class];
          if (component.factor !== expected || (card.storage_class === "cold" && card.multi_az)) ctx.addIssue({ code: "custom", path: ["components", index, "factor"], message: "Storage factor must match storage class and availability zone" });
        }
      }
      if (!card.package && !card.components?.length) ctx.addIssue({ code: "custom", message: "OBS requires a package or at least one component" });
      if (card.package && card.billing === "ondemand") ctx.addIssue({ code: "custom", message: "OBS packages require monthly or yearly billing" });
      if (card.package && card.components?.length) ctx.addIssue({ code: "custom", message: "OBS package and usage components cannot be combined" });
    }
  });
export type CardInput = z.output<typeof CardInput>;

export const ListServicesInput = z.strictObject({ query: z.string().default("").describe("Optional service search text") });
export const ListRegionsInput = z.strictObject({ service: z.string().default("").describe("Optional service code"), region: z.string().default("").describe("Optional region filter") });
export const SearchInput = z.strictObject({ service: Nonempty, region: RegionInput, query: z.string().default("").describe("Search terms"), billing: Billing.optional(), min_vcpus: Nonnegative.optional().describe("Minimum vCPUs"), min_memory_gb: Nonnegative.optional().describe("Minimum memory in GB"), limit: PositiveInteger.default(30).describe("Maximum results, default 30"), refresh: BooleanInput.default(false).describe("Bypass catalog cache and mirror") });
export const DescribeInput = z.strictObject({ service: Nonempty, region: RegionInput.default("sa-brazil-1") });
export const QuoteInput = z.strictObject({ region: RegionInput, items: z.array(QuoteItem).min(1).describe("Items to price"), billing: Billing.default("ondemand"), hours: Numeric.pipe(z.number().positive()).default(730).describe("On-demand hours; default 730"), periods: PositiveInteger.default(1).describe("Number of billing periods") });
export const ConvertInput = z.strictObject({ amount_usd: Numeric.describe("USD amount, may be negative"), currency: Nonempty.describe("Target currency code") });
export const CompareModesInput = z.strictObject({ items: z.array(QuoteItem).min(1).describe("Items to compare"), modes: z.array(Billing).default(["ondemand", "monthly", "yearly"]).describe("Billing modes"), region: RegionInput.default("sa-brazil-1"), currency: Nonempty.default("USD") });
export const CompareRegionsInput = z.strictObject({ items: z.array(QuoteItem).min(1).describe("Items to compare"), regions: z.array(RegionInput).min(1).describe("Region IDs or friendly names"), mode: Billing.default("monthly") });
export const ListReferenceInput = z.strictObject({ url_or_id: ListReference });
export const CreateListInput = z.strictObject({ name: Nonempty.describe("Saved list name"), items: z.array(CardInput).min(1).describe("Calculator cards"), dry_run: BooleanInput.default(false).describe("Build without saving"), settlement: z.enum(["total", "monthly"]).default("total").describe("Settlement display"), currency: Nonempty.default("USD").describe("Share link currency") });
export const RenameListInput = z.strictObject({ url_or_id: ListReference, new_name: Nonempty.describe("New list name") });
export const DuplicateListInput = z.strictObject({ url_or_id: ListReference, new_name: Nonempty.optional().describe("Optional copy name") });
export const LoginInput = z.strictObject({ timeout: Numeric.pipe(z.number().positive()).default(300).describe("Login timeout in seconds") });
