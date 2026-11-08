import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadService } from "../src/core/schema-model.ts";
import { supportedServices } from "../src/core/services/index.ts";
import {
  PRIMARY_GROUP,
  RECIPE_SPEC_FIELDS,
  SINGLE_QUANTITY,
  SPEC_ARG,
  SPEC_RULES,
  USAGE_PRICED,
  VERIFIED,
  VERIFIED_FRONTEND,
} from "../src/core/services/publication.ts";
import { ACCEPTED_DEFAULT_ONLY, RECIPES } from "../src/core/services/forms.ts";
import { FIXED_BASE_COST_SERVICES } from "../src/core/compiler/anti-split.ts";
import { KNOWN_VENDOR_DEFECTS } from "../src/core/compiler/circuit-breaker.ts";
import { SERVICE_ALIASES } from "../src/core/compiler/normalizer.ts";

export interface CategoryMeta {
  id: string;
  title: string;
  description: string;
  services: string[];
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: "compute",
    title: "Compute",
    description: "Virtual machines, serverless functions, and dedicated compute instances.",
    services: ["ecs", "function", "hecs"],
  },
  {
    id: "containers",
    title: "Containers",
    description: "Managed Kubernetes clusters, serverless container instances, and multi-cloud container fleets.",
    services: ["cce", "cci", "ucs"],
  },
  {
    id: "databases",
    title: "Databases & Cache",
    description: "Relational, NoSQL, document, distributed databases, caching, and data replication services.",
    services: ["rds", "rdsformariadb", "taurusdb", "gaussdb", "hrds", "dds", "nosql", "redis", "memcached", "ddm", "drs"],
  },
  {
    id: "storage",
    title: "Storage & Backup",
    description: "Block volumes, object storage, network file systems, cloud backup vaults, and disaster recovery.",
    services: ["evs", "obs", "sfs", "sfsturbo", "cbr", "sdrs", "dss", "des"],
  },
  {
    id: "networking",
    title: "Networking & Edge",
    description: "Load balancers, NAT gateways, elastic IPs, enterprise routers, VPNs, and direct interconnects.",
    services: ["elb", "nat", "eip", "er", "vpcep", "vpn", "dline", "cc", "esw", "ga"],
  },
  {
    id: "middleware",
    title: "Middleware & Messaging",
    description: "API gateways and managed Kafka and RabbitMQ message brokers.",
    services: ["apig", "kafka", "rabbitmq", "reliability"],
  },
  {
    id: "security",
    title: "Security & Compliance",
    description: "Web application firewalls, cloud firewalls, host security, KMS encryption, and DDoS protection.",
    services: ["waf", "cfw", "hss", "dew", "ssa", "aad", "dbss", "dsc", "edgesec"],
  },
  {
    id: "management-ai",
    title: "Observability & AI",
    description: "Log management, application performance monitoring, and ModelArts Studio token inference.",
    services: ["lts", "apm", "maas"],
  },
];

interface ScenarioExample {
  file: string;
  snippet: string;
}

async function collectScenarioExamples(): Promise<Map<string, ScenarioExample>> {
  const dir = "tests/fixtures/scenarios";
  const files = (await readdir(dir)).filter(f => f.endsWith(".yaml")).sort();
  const map = new Map<string, ScenarioExample>();

  for (const file of files) {
    const content = await readFile(join(dir, file), "utf8");
    const doc = Bun.YAML.parse(content) as Record<string, any>;
    const templates = (doc.templates ?? {}) as Record<string, any>;
    const resources = (doc.resources ?? []) as Array<Record<string, any>>;

    for (const res of resources) {
      let rawSvc = res.service;
      if (!rawSvc && res.use && templates[res.use]) {
        rawSvc = templates[res.use].service;
      }
      if (!rawSvc) continue;
      const svc = SERVICE_ALIASES[String(rawSvc).toLowerCase()] ?? String(rawSvc).toLowerCase();
      if (map.has(svc)) continue;

      const merged = res.use && templates[res.use]
        ? {
            id: res.id,
            service: svc,
            ...(res.environment ? { environment: res.environment } : {}),
            ...(res.quantity ? { quantity: res.quantity } : {}),
            billing: res.billing ?? templates[res.use].billing ?? doc.defaults?.billing ?? "monthly",
            ...(res.needs || templates[res.use].needs ? { needs: { ...templates[res.use].needs, ...res.needs } } : {}),
            ...(res.spec ? { spec: res.spec } : {}),
            ...(res.options || templates[res.use].options ? { options: { ...templates[res.use].options, ...res.options } } : {}),
          }
        : { ...res, service: svc };

      const snippet = Bun.YAML.stringify([merged], null, 2).trim();
      map.set(svc, { file, snippet });
    }
  }
  return map;
}

const PLAIN_EXAMPLES: Record<string, string> = {
  ecs: `cards:
  - id: web-tier
    service: ecs
    region: sa-brazil-1
    billing: monthly
    quantity: 2
    needs: { vcpus: 4, memory_gb: 8 }
    options:
      image: "Ubuntu 22.04 server 64bit"
      system_disk: [GPSSD, 100]
      bandwidth_mbit: 10`,
  evs: `cards:
  - id: data-volume
    service: evs
    region: sa-brazil-1
    billing: monthly
    quantity: 3
    spec: GPSSD
    options:
      size_gb: 500`,
  obs: `cards:
  - id: object-store
    service: obs
    region: sa-brazil-1
    billing: ondemand
    options:
      storage_class: standard
      multi_az: true
      components:
        - { factor: size_3az, value: 10, unit: TB }
        - { factor: download.external, value: 1000 }
        - { factor: get, value: 500 }
        - { factor: put, value: 50 }`,
  rds: `cards:
  - id: primary-db
    service: rds
    region: sa-brazil-1
    billing: monthly
    spec: rds.mysql.n1.large.2.ha
    options:
      storage_gb: 200`,
  cce: `cards:
  - id: k8s-cluster
    service: cce
    region: sa-brazil-1
    billing: monthly
    options:
      cluster_type: standard
      ha: true
      scale: small`,
  redis: `cards:
  - id: cache-cluster
    service: redis
    region: sa-brazil-1
    billing: monthly
    spec: redis.ha.xu1.large.r2.8
    options:
      instances: 1`,
};

const OPTION_NOTES: Record<string, Record<string, string>> = {
  ecs: {
    image: "Operating system image label (e.g. `Ubuntu 22.04 server 64bit`, `AlmaLinux 9.4 64bit`). Bare `AlmaLinux` is rejected at apply time as ambiguous.",
    system_disk: "System volume tuple `[TYPE, SIZE_GB]` or `{ type, size }` (40–1024 GB). Types: `GPSSD`, `SSD`, `SAS`, `GPSSD2`, `ESSD`. Default: `['GPSSD', 40]`.",
    data_disks: "List of attached data volumes `[[TYPE, SIZE_GB], ...]`.",
    bandwidth_mbit: "Dedicated EIP bandwidth in Mbit/s (1–2000 Mbit/s for BGP, 1–9999 GB for traffic).",
    bandwidth_type: "EIP billing mode (`19_bgp` for by-bandwidth, `12_bgp` for by-traffic).",
    ri_time: "Reserved instance commitment term (`1_3` for 1-year or `3_3` for 3-year; requires `billing: ri`).",
  },
  evs: {
    size_gb: "Disk capacity in GB (minimum 10 GB).",
    iops: "Provisioned IOPS (applies only to on-demand `GPSSD2` or `ESSD2` volumes).",
    throughput: "Provisioned throughput in MB/s (applies only to on-demand `GPSSD2` volumes).",
  },
  obs: {
    storage_class: "Storage tier: `standard`, `warm` (Infrequent Access), or `cold` (Archive). Default: `standard`.",
    multi_az: "Enable 3-AZ redundancy (`true` or `false`). Not supported on `cold` pay-per-use storage.",
    package: "Prepaid Standard storage package (`40gb` to `10pb`). Requires `monthly` or `yearly` billing.",
    traffic_package: "Prepaid outbound traffic package (`50gb` to `300tb`, or `none`). Requires `package`.",
    months: "Duration in months (1–12) for pay-per-use usage cards.",
    components: "Explicit usage lines (`size`, `size_3az`, `download.external`, `get`, `put`, etc.). In `version: \"1\"`, high-level options (`capacity`, `traffic`, `read_requests`, `write_requests`) compile into `components` automatically.",
  },
  rds: {
    storage_gb: "Database volume size in GB (40–4000 GB).",
    storage_spec: "Volume SKU override; defaults to the selected engine's Cloud SSD volume.",
    db_version: "Database engine version (e.g. `8.0`, `5.7`, `14`).",
  },
  cce: {
    cluster_type: "Cluster edition (`standard`). CCE Turbo is currently blocked pending verification.",
    ha: "High-availability multi-master control plane (`true` selects `cce.s2.*`, `false` selects `cce.s1.*`).",
    scale: "Maximum worker node scale (`small` = 50, `medium` = 200, `large` = 1000, `xlarge` = 2000).",
  },
  sfsturbo: {
    size_gb: "File system capacity in GB (must be a multiple of 0.1 TB = 102.4 GB; min 3686.4 GB for `20MBps`, 1228.8 GB for others).",
  },
  dew: {
    keys: "Number of KMS custom keys or CSMS secrets (1–99 per physical card; automatically split across cards in `version: \"1\"`).",
    api_requests: "API request units (1–9,999 per physical card, in units of 10,000 requests; automatically split across cards in `version: \"1\"`).",
    days: "On-demand duration in days (default: `30`).",
    storage_spec: "Key/secret storage SKU (`kms.ud.customer` or `csms.secret.storage`).",
    api_spec: "API call SKU (`kms.api` or `csms.secret.api`).",
  },
  waf: {
    domains: "Domain expansion package count (≥ 1).",
    rules: "Rule expansion package count (≥ 1).",
    requests: "Monthly request count (≥ 1,000,000).",
  },
  kafka: {
    spec_id: "Broker flavor (`kafka.2u4g.single.small`, `c6.2u4g.cluster`, `c6.4u8g.cluster`, `c6.8u16g.cluster`, `c6.12u24g.cluster`, `c6.16u32g.cluster`).",
    brokers: "Broker count (`1` for single-node, `≥ 3` for cluster).",
    storage_gb: "Total broker disk storage in GB (≥ 100 GB).",
  },
  rabbitmq: {
    spec_id: "Broker flavor (`c6.2u4g.single`..`c6.24u48g.single` or `c6.2u4g.cluster`..`c6.32u64g.cluster`).",
    brokers: "Broker count (`1` for single-node; `3`, `5`, or `7` for cluster).",
    storage_gb: "Broker storage in GB (≥ 100 GB).",
    version: "RabbitMQ engine version (default: `3.8`).",
  },
  nosql: {
    flavor: "GeminiDB node size (`large.4`, `xlarge.4`, `2xlarge.4`, `4xlarge.4`, `8xlarge.4`).",
    nodes: "Cluster node count (2–200).",
    storage_gb: "Storage space in GB (≥ 100 GB).",
    engine: "NoSQL API engine (`dynamodb`).",
  },
  cci: {
    vcpu: "Container vCPU allocation (1–512).",
    mem_gb: "Container memory allocation in GB (1–512 GB).",
  },
  elb: {
    public_ip_count: "Shared load balancer network selector (`1` or `2`).",
  },
  cbr: {
    size_gb: "Backup vault capacity in GB (10–10,485,760 GB).",
  },
};

function aliasesFor(service: string): string[] {
  return Object.entries(SERVICE_ALIASES)
    .filter(([, target]) => target === service)
    .map(([alias]) => alias)
    .sort();
}

function formatRanges(ranges: Array<{ min?: number | null; max?: number | null; step?: number | null; default?: number | null; unit?: string | null; when?: string | null }>): string {
  if (!ranges || ranges.length === 0) return "Catalog / Enum";
  const parts = ranges.map(r => {
    const min = r.min ?? "";
    const max = r.max ?? "";
    const unit = r.unit ? ` ${r.unit}` : "";
    const step = r.step ? ` (step ${r.step})` : "";
    const when = r.when ? ` when \`${r.when}\`` : "";
    if (min !== "" && max !== "" && min === max) return `Default \`${min}${unit}\`${when}`;
    return `\`${min}..${max}${unit}\`${step}${when}`;
  });
  return parts.join("<br>");
}

async function parseCompat(service: string): Promise<{ header: string; scenarios: Array<{ scenario: string; result: string; stage: string; detail: string }>; notes: string[] }> {
  try {
    const text = await readFile(`docs/compat/${service}.md`, "utf8");
    const lines = text.split(/\r?\n/);
    const header = lines[0]?.replace(/^#\s*/, "") ?? `${service} compatibility`;
    const scenarios: Array<{ scenario: string; result: string; stage: string; detail: string }> = [];
    const notes: string[] = [];
    let inNotes = false;
    for (const line of lines.slice(1)) {
      if (line.startsWith("## Not quotable")) {
        inNotes = true;
        continue;
      }
      if (inNotes) {
        if (line.trim().startsWith("- ")) notes.push(line.trim().slice(2));
        continue;
      }
      if (line.startsWith("|") && !line.includes("scenario |") && !line.includes("|---")) {
        const cols = line.split("|").slice(1, -1).map(c => c.trim());
        if (cols.length >= 4 && cols[0]) {
          scenarios.push({ scenario: cols[0], result: cols[1] ?? "", stage: cols[2] ?? "", detail: cols[3] ?? "" });
        }
      }
    }
    return { header, scenarios, notes };
  } catch {
    return { header: `${service} compatibility`, scenarios: [], notes: [] };
  }
}

async function main() {
  const allSupported = new Map(supportedServices().map(s => [s.service, s]));
  const scenarioExamples = await collectScenarioExamples();
  const outDir = "docs/reference/services";
  await mkdir(outDir, { recursive: true });

  // 1. Generate Category Index Pages & Individual Service Pages
  const indexRows: string[] = [];

  for (const category of CATEGORIES) {
    for (const service of category.services) {
      const info = allSupported.get(service);
      if (!info) throw new Error(`Unknown service in category map: ${service}`);
      const schema = await loadService(service);
      const compat = await parseCompat(service);
      const aliases = aliasesFor(service);
      const recipe = RECIPES[service];
      const specArg = SPEC_ARG[service];
      const primaryGroup = PRIMARY_GROUP[service];
      const recipeSpec = RECIPE_SPEC_FIELDS[service];
      const singleQty = SINGLE_QUANTITY.has(service);
      const fixedBase = FIXED_BASE_COST_SERVICES.has(service);
      const usagePriced = USAGE_PRICED.has(service);
      const defects = KNOWN_VENDOR_DEFECTS.filter(d => d.service === service);

      const totalControls = schema?.controls.length ?? 0;
      const mappedControls = schema?.controls.filter(c => c.option != null).length ?? 0;
      const unsupportedControls = schema?.controls.filter(c => c.unsupported).length ?? 0;

      const statusBadge = info.publication_supported
        ? "`VERIFIED` (Full Publish Gate)"
        : ACCEPTED_DEFAULT_ONLY.has(service)
          ? "`DEFAULT_ONLY` (Catalog & Replay Only)"
          : "`CATALOG_ONLY` (Unverified Form Mapping)";

      indexRows.push(
        `| [\`${service}\`](${service}.md) | ${info.description} | ${category.title} | ${info.modes.map(m => `\`${m}\``).join(", ")} | ${info.publication_supported ? "Verified (`11.4.201`)" : "Catalog / Replay"} |`
      );

      const v1Example = scenarioExamples.get(service);
      const v1Yaml = v1Example
        ? `\`\`\`yaml\nversion: "1"\nmetadata:\n  id: example-${service}\n  customer: Example Corp\n  title_prefix: "Example ${service.toUpperCase()}"\ndefaults:\n  region: ${service === "maas" ? "ap-southeast-1" : "sa-brazil-1"}\n  billing: ${info.modes[0] ?? "monthly"}\nresources:\n${v1Example.snippet.split("\n").map(l => "  " + l).join("\n")}\n\`\`\``
        : `\`\`\`yaml\nversion: "1"\nmetadata:\n  id: example-${service}\n  customer: Example Corp\n  title_prefix: "Example ${service.toUpperCase()}"\ndefaults:\n  region: ${service === "maas" ? "ap-southeast-1" : "sa-brazil-1"}\n  billing: ${info.modes[0] ?? "monthly"}\nresources:\n  - id: ${service}-main\n    service: ${service}\n    billing: ${info.modes[0] ?? "monthly"}\n\`\`\``;

      const plainYaml = PLAIN_EXAMPLES[service]
        ? `\`\`\`yaml\ncustomer: Example Corp\nname: "Example ${service.toUpperCase()}"\nsettlement: total\n${PLAIN_EXAMPLES[service]}\n\`\`\``
        : null;

      // Option table rows
      const optionRows: string[] = [];
      const seenOptions = new Set<string>();
      if (specArg) {
        seenOptions.add(specArg);
        optionRows.push(
          `| \`spec\` / \`options.${specArg}\` | \`string\` | Catalog SKU | Resolved catalog specification code (group \`${primaryGroup ?? "default"}\`). Can also be selected via \`needs:\`. |`
        );
      } else if (primaryGroup) {
        optionRows.push(
          `| \`spec\` | \`string\` | Catalog SKU | Catalog specification code in group \`${primaryGroup}\`. |`
        );
      }

      if (schema) {
        const byOption = new Map<string, typeof schema.controls>();
        for (const ctrl of schema.controls) {
          if (!ctrl.option || ["region", "billing", "periods", "quantity"].includes(ctrl.option)) continue;
          const list = byOption.get(ctrl.option) ?? [];
          list.push(ctrl);
          byOption.set(ctrl.option, list);
        }
        for (const [optName, ctrls] of byOption.entries()) {
          seenOptions.add(optName);
          const controlIds = ctrls.map(c => `\`${c.id}\``).join(", ");
          const ranges = ctrls.flatMap(c => c.ranges ?? []);
          const rangeStr = formatRanges(ranges);
          const customNote = OPTION_NOTES[service]?.[optName];
          const titles = Array.from(new Set(ctrls.map(c => c.title).filter(Boolean))).join(" / ");
          const desc = customNote
            ? `${customNote} *(Portal controls: ${controlIds})*`
            : `${titles ? `**${titles}**. ` : ""}Maps to portal control${ctrls.length > 1 ? "s" : ""} ${controlIds}.`;
          optionRows.push(`| \`options.${optName}\` | \`${ranges.length ? "number / unit" : "string"}\` | ${rangeStr} | ${desc} |`);
        }
      }

      for (const optName of info.options) {
        if (optName === "title" || seenOptions.has(optName)) continue;
        seenOptions.add(optName);
        const customNote = OPTION_NOTES[service]?.[optName] ?? `Builder option \`${optName}\`.`;
        optionRows.push(`| \`options.${optName}\` | \`any\` | Builder-validated | ${customNote} |`);
      }

      // Control table rows
      const controlRows = (schema?.controls ?? []).map(ctrl => {
        const status = ctrl.option
          ? `Mapped → \`${ctrl.option}\``
          : ctrl.unsupported
            ? `Fixed / Unsupported (${ctrl.note ?? "page default"})`
            : "Unmapped";
        const rangeStr = formatRanges(ctrl.ranges ?? []);
        return `| \`${ctrl.id}\` | ${ctrl.title ?? "—"} | \`${ctrl.kind}\` | ${rangeStr} | ${status} |`;
      });

      const behavioralNotes: string[] = [];
      if (singleQty) {
        behavioralNotes.push("**Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).");
      } else {
        behavioralNotes.push("**Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.");
      }
      if (fixedBase) {
        behavioralNotes.push("**Anti-Splitting Invariant (`FIXED_BASE_COST_SERVICES`)**: Carries a baseline instance or cluster fee. The compiler never splits this resource across multiple cards.");
      }
      if (usagePriced) {
        behavioralNotes.push("**Usage-Priced (`USAGE_PRICED`)**: Pay-per-use SKUs carry usage plans rather than a flat catalog list price; `plan-quote` resolves the SKU, and exact usage rating runs during `apply-quote` / `quote`.");
      }
      if (recipe?.regionless) {
        behavioralNotes.push("**Global / Regionless Form**: This service's calculator page omits the standard region selector (`regionless: true`).");
      }
      if (recipeSpec && recipeSpec.fields.length > 0) {
        const mappedFields = recipeSpec.fields.map(f => Array.isArray(f) ? `\`${f[0]}\` (from SKU \`${f[1]}\`)` : `\`${f}\``).join(", ");
        behavioralNotes.push(`**SKU-to-Control Projection**: The resolved catalog SKU populates form controls: ${mappedFields}.`);
      }
      if (service in SPEC_RULES) {
        if (service === "des") behavioralNotes.push("**Spec Rule**: `options.devices` (onsite days) is valid only on Teleport specs (`des.teleport.*`), not `des.disk`.");
        if (service === "hss") behavioralNotes.push("**Spec Rule**: `options.edition` must match the catalog SKU edition (`hss.version.basic`, `hss.version.premium`, `hss.version.wtp`, `hss.version.container.enterprise`, `hss.version.advanced`).");
        if (service === "hrds") behavioralNotes.push("**Spec Rule**: Dedicated RDS (`hrds`) requires a `y1` family specification (`rds.<engine>.y1.*`).");
      }
      for (const defect of defects) {
        behavioralNotes.push(`**Known Vendor Portal Defect (\`${defect.defectId}\` on \`${defect.billing ?? "all"}\`)**: ${defect.description} *(${defect.advisory})*`);
      }
      for (const n of compat.notes) {
        behavioralNotes.push(n);
      }

      const compatTable = compat.scenarios.length
        ? [
            "| Scenario | Replay Result | Stage | Detail |",
            "| :--- | :--- | :--- | :--- |",
            ...compat.scenarios.map(s => `| \`${s.scenario}\` | \`${s.result}\` | \`${s.stage}\` | ${s.detail || "—"} |`),
          ].join("\n")
        : "*No live replay scenarios recorded.*";

      const pageMd = `# \`${service}\` — ${info.description}

| Property | Value |
| :--- | :--- |
| **Service Code** | \`${service}\`${aliases.length ? ` (aliases: ${aliases.map(a => `\`${a}\``).join(", ")})` : ""} |
| **Category** | ${category.title} |
| **Publish Gate Status** | ${statusBadge}${info.publication_blocked_reason ? ` — *${info.publication_blocked_reason}*` : ""} |
| **Verified Frontend** | \`${schema?.frontend ?? VERIFIED_FRONTEND}\` |
| **Supported Billing Modes** | ${info.modes.map(m => `\`${m}\``).join(", ")}${service === "ecs" ? ", `ri` (Reserved Instance)" : ""} |
| **Primary Catalog Group** | ${primaryGroup ? `\`${primaryGroup}\`` : "—"} |
| **Schema Coverage** | ${totalControls} controls (${mappedControls} mapped, ${unsupportedControls} intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (\`version: "1"\`)

${v1Yaml}
${plainYaml ? `\n### Plain Card (\`cards:\`)\n\n${plainYaml}\n` : ""}
---

## Argument Reference (\`needs\` & \`options\`)

Top-level card fields: \`id\` (required), \`service: ${service}\`, \`region\`, \`billing\` (${info.modes.map(m => `\`${m}\``).join(" | ")}), \`quantity\` (${singleQty ? "fixed to `1`" : "positive integer"}), \`needs\` (for automatic SKU ranking by \`vcpus\` / \`memory_gb\`), \`spec\` (explicit catalog SKU), and \`options\`.

${optionRows.length > 0 ? [
  "| Field | Type | Range / Allowed | Description |",
  "| :--- | :--- | :--- | :--- |",
  ...optionRows,
].join("\n") : "*This service uses default calculator form settings and does not expose custom `options`.*"}

---

## Behavioral Rules & Constraints

${behavioralNotes.map(n => `- ${n}`).join("\n")}

---

## Portal Control Schema (\`autocalc://schema/${service}\`)

Source file: \`src/schema/files/${service}.yaml\`

${controlRows.length > 0 ? [
  "| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |",
  "| :--- | :--- | :--- | :--- | :--- |",
  ...controlRows,
].join("\n") : "*No portal controls recorded.*"}

---

## Live Compatibility Replay

Source: \`docs/compat/${service}.md\` (${compat.header})

${compatTable}
`;

      await writeFile(join(outDir, `${service}.md`), pageMd, "utf8");
    }
  }

  // Generate docs/reference/services/index.md
  const categorySections = CATEGORIES.map(cat => {
    const rows = cat.services.map(svc => {
      const info = allSupported.get(svc)!;
      const aliases = aliasesFor(svc);
      const status = info.publication_supported ? "`VERIFIED`" : ACCEPTED_DEFAULT_ONLY.has(svc) ? "`DEFAULT_ONLY`" : "`CATALOG_ONLY`";
      return `| [\`${svc}\`](${svc}.md) | ${info.description} | ${aliases.length ? aliases.map(a => `\`${a}\``).join(", ") : "—"} | ${info.modes.map(m => `\`${m}\``).join(", ")} | ${status} |`;
    });
    return `### ${cat.title}

${cat.description}

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
${rows.join("\n")}`;
  }).join("\n\n");

  const indexMd = `# Huawei Cloud Service Catalog

This section is the **Terraform Registry-style provider reference** for all **51 Huawei Cloud calculator services** in \`autocalc\`.

Every service page documents:
- **Example Usage**: Ready-to-use \`version: "1"\` declarative YAML snippets.
- **Argument Reference**: Legal \`needs\`, \`spec\`, and \`options\` fields, types, and UI stepper ranges.
- **Behavioral Rules & Constraints**: Single-quantity restrictions, anti-splitting invariants (\`FIXED_BASE_COST_SERVICES\`), usage-pricing rules, and known vendor portal defects.
- **Portal Control Schema**: The complete widget mapping from \`src/schema/files/<service>.yaml\` (also exposed via MCP as \`autocalc://schema/<service>\`).
- **Live Compatibility Replay**: Scenario-by-scenario replay results against frontend \`11.4.201\`.

> **Keeping this catalog in sync**: Regenerate all service pages from the schemas and compatibility reports with \`bun run docs:generate\`.

---

## Verification Tiers

- **\`VERIFIED\` (40 services)**: 100% control mapping coverage in \`src/schema/files/*.yaml\` and full support in \`plan-quote\` / \`apply-quote\` through the 3-way fail-closed publish gate (\`stored == rated == Edit\`).
- **\`DEFAULT_ONLY\` / \`CATALOG_ONLY\` (11 services)**: Supported for catalog search (\`autocalc search\`), standalone rating (\`autocalc quote\`), and anonymous replay (\`bun run compat\`), but blocked from \`apply-quote\` / \`publish-quote\` until custom option or spec mappings are verified against the Edit gate.

---

${categorySections}
`;

  await writeFile(join(outDir, "index.md"), indexMd, "utf8");
  console.log(`Generated ${ indexRows.length } service reference pages and index in ${outDir}/`);
}

if (import.meta.main) await main();
