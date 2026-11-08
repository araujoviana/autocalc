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
  maas: `cards:
  - id: maas-deepseek-tokens
    service: maas
    region: ap-southeast-1
    billing: ondemand
    spec: modelarts.tokens.deepseek.v4.1.flash
    options:
      input_mtokens: 50
      output_mtokens: 10`,
  function: `cards:
  - id: serverless-api
    service: function
    region: sa-brazil-1
    billing: ondemand
    options:
      requests_10k: 1000
      memory_mb: 512
      compute: 100`,
  lts: `cards:
  - id: centralized-logs
    service: lts
    region: sa-brazil-1
    billing: ondemand
    options:
      flow_gb_per_day: 10
      retention_days: 30
      index_percent: 100`,
  apm: `cards:
  - id: apm-monitors
    service: apm
    region: sa-brazil-1
    billing: ondemand
    spec: apm2.instance.normal`,
  hecs: `cards:
  - id: flexus-x-instance
    service: hecs
    region: sa-brazil-1
    billing: monthly
    quantity: 1`,
  nat: `cards:
  - id: nat-gateway
    service: nat
    region: sa-brazil-1
    billing: ondemand
    options:
      size: middle`,
  elb: `cards:
  - id: shared-load-balancer
    service: elb
    region: sa-brazil-1
    billing: ondemand
    options:
      public_ip_count: 1`,
  eip: `cards:
  - id: egress-public-ip
    service: eip
    region: sa-brazil-1
    billing: ondemand
    options:
      ip_quantity: 1
      bandwidth_mbps: 10`,
  sfsturbo: `cards:
  - id: high-iops-nfs
    service: sfsturbo
    region: sa-brazil-1
    billing: yearly
    options:
      tier: 20MBps
      size_gb: 3686.4`,
  sfs: `cards:
  - id: shared-nfs
    service: sfs
    region: sa-brazil-1
    billing: ondemand
    options:
      capacity_gb: 1000`,
  cbr: `cards:
  - id: server-backup-vault
    service: cbr
    region: sa-brazil-1
    billing: yearly
    options:
      vault_spec: vault.backup.server.normal
      size_gb: 1000`,
  dew: `cards:
  - id: kms-keys
    service: dew
    region: sa-brazil-1
    billing: ondemand
    options:
      keys: 5
      api_requests: 10`,
  waf: `cards:
  - id: cloud-waf
    service: waf
    region: sa-brazil-1
    billing: ondemand
    options:
      domains: 1
      rules: 1
      requests: 1000000`,
  cfw: `cards:
  - id: edge-firewall
    service: cfw
    region: sa-brazil-1
    billing: monthly
    options:
      edition: detail_3_
      bandwidth_mbps: 10
      eips: 1`,
  hss: `cards:
  - id: server-security
    service: hss
    region: sa-brazil-1
    billing: monthly
    quantity: 5
    options:
      edition: dataInfo_4_`,
  kafka: `cards:
  - id: event-stream
    service: kafka
    region: sa-brazil-1
    billing: monthly
    options:
      spec_id: c6.2u4g.cluster
      brokers: 3
      storage_gb: 100`,
  rabbitmq: `cards:
  - id: task-queue
    service: rabbitmq
    region: sa-brazil-1
    billing: monthly
    options:
      spec_id: c6.2u4g.single
      brokers: 1
      storage_gb: 100
      version: "3.8"`,
  nosql: `cards:
  - id: document-kv
    service: nosql
    region: sa-brazil-1
    billing: monthly
    options:
      flavor: large.4
      nodes: 2
      storage_gb: 100
      engine: dynamodb`,
  dds: `cards:
  - id: mongodb-repset
    service: dds
    region: sa-brazil-1
    billing: monthly
    spec: dds.mongodb.c6.large.8.repset
    options:
      type: ReplicaSet
      shard_storage_gb: 100`,
  taurusdb: `cards:
  - id: distributed-mysql
    service: taurusdb
    region: sa-brazil-1
    billing: monthly
    spec: gaussdb.mysql.large.x86.4
    options:
      enterprise_instance: standard
      nodes: 2
      storage_gb: 100`,
  gaussdb: `cards:
  - id: enterprise-opengauss
    service: gaussdb
    region: sa-brazil-1
    billing: monthly
    spec: gaussdb.bs.c6.4xlarge.x864.ha
    options:
      deploy_model: centralized
      storage_gb: 100`,
  rdsformariadb: `cards:
  - id: mariadb-ha
    service: rdsformariadb
    region: sa-brazil-1
    billing: monthly
    spec: mariadb.x1.large.4.ha
    options:
      instance_type: Ha
      storage_gb: 100`,
  hrds: `cards:
  - id: dedicated-mysql
    service: hrds
    region: sa-brazil-1
    billing: monthly
    spec: rds.mysql.y1.large.2.ha
    options:
      db_type: mysql
      storage_gb: 120`,
  memcached: `cards:
  - id: session-cache
    service: memcached
    region: sa-brazil-1
    billing: ondemand
    options:
      instance_type: single_node
      memory_gb: 4`,
  dline: `cards:
  - id: direct-connect
    service: dline
    region: sa-brazil-1
    billing: monthly
    options:
      port: 1ge`,
  vpn: `cards:
  - id: ipsec-vpn
    service: vpn
    region: sa-brazil-1
    billing: monthly
    options:
      eip1_mbps: 10
      eip2_mbps: 10
      connection_groups: 10`,
  er: `cards:
  - id: hub-router
    service: er
    region: sa-brazil-1
    billing: ondemand
    options:
      attachments: 2
      downflow_gb: 500`,
  vpcep: `cards:
  - id: service-endpoint
    service: vpcep
    region: sa-brazil-1
    billing: ondemand
    options:
      duration_hours: 730`,
  sdrs: `cards:
  - id: vm-dr-protection
    service: sdrs
    region: sa-brazil-1
    billing: ondemand
    options:
      protection_groups: 2`,
  des: `cards:
  - id: data-express
    service: des
    region: sa-brazil-1
    billing: ondemand
    spec: des.teleport.60TB
    options:
      transfer_type: teleport
      devices: 5`,
  dss: `cards:
  - id: dedicated-storage-pool
    service: dss
    region: sa-brazil-1
    billing: yearly
    spec: DSS.SAS
    options:
      type: SAS
      capacity: 43.350 TB`,
  ddm: `cards:
  - id: database-middleware
    service: ddm
    region: sa-brazil-1
    billing: monthly
    quantity: 2
    options:
      spec_type: c6
      spec: ddm.c6.2xlarge.2`,
  drs: `cards:
  - id: db-sync
    service: drs
    region: sa-brazil-1
    billing: ondemand
    spec: drs.xlg.sync
    options:
      type: sync
      flow: into_cloud
      specification: large`,
  apig: `cards:
  - id: api-gateway-instance
    service: apig
    region: sa-brazil-1
    billing: ondemand
    options:
      edition: BASIC`,
  ssa: `cards:
  - id: secmaster
    service: ssa
    region: sa-brazil-1
    billing: ondemand
    options:
      edition: professional`,
};

const OPTION_NOTES: Record<string, Record<string, string>> = {
  ecs: {
    flavor: "Resolved catalog CPU architecture and flavor specification (group `ec2_vm`). In declarative `version: \"1\"`, choose via `needs: { vcpus: N, memory_gb: N }`.",
    image: "Operating system image label (e.g. `Ubuntu 22.04 server 64bit`, `AlmaLinux 9.4 64bit`). In declarative `version: \"1\"`, friendly shorthands like `os: ubuntu-22.04` or `alma-9.4` normalize automatically. Bare `AlmaLinux` is rejected as ambiguous.",
    system_disk: "System volume tuple `[TYPE, SIZE_GB]` or `{ type, size }` (40–1024 GB). Types: `GPSSD`, `SSD`, `SAS`, `GPSSD2`, `ESSD`. Default: `['GPSSD', 40]`.",
    data_disks: "List of attached data volumes `[[TYPE, SIZE_GB], ...]`.",
    bandwidth_mbit: "Dedicated EIP bandwidth in Mbit/s (1–2000 Mbit/s for BGP, 1–9999 GB for traffic). In declarative quotes, write `bandwidth: 10 Mbps`.",
    bandwidth_type: "EIP billing mode (`19_bgp` for by-bandwidth, `12_bgp` for by-traffic).",
    ri_time: "Reserved instance commitment term (`1_3` for 1-year or `3_3` for 3-year; requires `billing: ri`).",
  },
  evs: {
    type: "Volume storage class: `GPSSD` (General-Purpose SSD), `SSD` (Ultra-high I/O), `SAS` (High I/O), `ESSD` (Extreme SSD), `GPSSD2`, `ESSD2`. In declarative `version: \"1\"`, write `volume_type: general-ssd`.",
    size_gb: "Disk capacity in GB (minimum 10 GB). In declarative `version: \"1\"`, supports unit strings like `size: 500 GiB`.",
    iops: "Provisioned IOPS (applies only to on-demand `GPSSD2` or `ESSD2` volumes).",
    throughput: "Provisioned throughput in MB/s (applies only to on-demand `GPSSD2` volumes).",
  },
  obs: {
    storage_class: "Storage tier: `standard`, `warm` (Infrequent Access), or `cold` (Archive). Default: `standard`.",
    multi_az: "Enable 3-AZ redundancy (`true` or `false`). In declarative quotes, write `redundancy: multi-az` or `availability: multi-az`. Not supported on `cold` pay-per-use storage.",
    package: "Prepaid Standard storage package (`40gb` to `10pb`). Requires `monthly` or `yearly` billing.",
    traffic_package: "Prepaid outbound traffic package (`50gb` to `300tb`, or `none`). Requires `package`.",
    months: "Duration in months (1–12) for pay-per-use usage cards.",
    components: "Explicit usage lines (`size`, `size_3az`, `download.external`, `get`, `put`, etc.). In `version: \"1\"`, high-level human options (`capacity: \"10 TB\"`, `traffic: \"5 TB/mo\"`, `read_requests: \"5000k/mo\"`, `write_requests: \"500k/mo\"`) compile into `components` automatically.",
  },
  rds: {
    storage_gb: "Database volume size in GB (40–4000 GB). In declarative `version: \"1\"`, write `storage_gb: \"500 GB\"`.",
    storage_spec: "Volume SKU override; defaults to the selected engine's Cloud SSD volume.",
    db_version: "Database engine release version (e.g. `8.0`, `5.7`, `14`). Alias: `version`.",
    flavor: "Database compute specification (group `rds_rds.vm`). Can also be synthesized from `needs: { vcpus, memory_gb }` and `topology: primary-standby`.",
    volume_type: "Storage media type selector (`cloud-ssd`, `common`).",
  },
  cce: {
    cluster_type: "Cluster edition (`standard`). CCE Turbo is currently blocked pending verification.",
    ha: "High-availability multi-master control plane (`true` selects `cce.s2.*` multi-master, `false` selects `cce.s1.*` single-master). Alias: `control_plane_ha: true` or `master_az: 3AZ`.",
    scale: "Maximum worker node scale (`small` = 50 nodes, `medium` = 200 nodes, `large` = 1000 nodes, `xlarge` = 2000 nodes). Accepts `50nodes`, `200nodes`, `1000nodes`, `2000nodes`.",
  },
  sfsturbo: {
    tier: "Throughput performance tier: `20MBps`, `40MBps`, `125MBps`, `250MBps`, `500MBps`, `1000MBps`. In declarative `version: \"1\"`, write `throughput: 40MBps`.",
    size_gb: "File system capacity in GB (must be a multiple of 0.1 TB = 102.4 GB; min 3686.4 GB for `20MBps`, 1228.8 GB for others). In declarative quotes, write `capacity: \"4 TB\"`.",
  },
  dew: {
    keys: "Number of KMS custom keys or CSMS secrets (1–99 per physical card; automatically split across cards in `version: \"1\"`). Alias: `secrets`, `custom_keys`.",
    api_requests: "API request units (1–9,999 per physical card, in units of 10,000 requests; automatically split across cards in `version: \"1\"`). In declarative quotes, write `requests: 100,000` or `10 units`.",
    days: "On-demand duration in days (default: `30`).",
    storage_spec: "Key/secret storage SKU (`kms.ud.customer` for KMS keys or `csms.secret.storage` for CSMS secrets). Automatically set when `type: csms`.",
    api_spec: "API call SKU (`kms.api` or `csms.secret.api`). Automatically set when `type: csms`.",
  },
  waf: {
    domains: "Additional protected domain expansion packages (≥ 1). In declarative quotes, write `domains: 2`.",
    rules: "Additional custom rule expansion packages (≥ 1). In declarative quotes, write `rules: 5`.",
    requests: "Monthly HTTP/HTTPS inspection request volume (≥ 1,000,000). In declarative quotes, write `requests: \"10M\"`.",
  },
  kafka: {
    spec_id: "Broker flavor (`kafka.2u4g.single.small`, `c6.2u4g.cluster`, `c6.4u8g.cluster`, `c6.8u16g.cluster`, `c6.12u24g.cluster`, `c6.16u32g.cluster`). Can also be passed as `flavor`.",
    brokers: "Broker node count: `1` for single-node specs, `≥ 3` for cluster specs.",
    storage_gb: "Broker disk storage per node in GB (≥ 100 GB). Note: total cluster storage equals `storage_gb * brokers`.",
  },
  rabbitmq: {
    spec_id: "Broker flavor (`c6.2u4g.single`..`c6.24u48g.single` or `c6.2u4g.cluster`..`c6.32u64g.cluster`). Can also be passed as `flavor`.",
    brokers: "Broker node count: `1` for single-node; `3`, `5`, or `7` for cluster.",
    storage_gb: "Broker disk storage per node in GB (≥ 100 GB). Total cluster storage equals `storage_gb * brokers`.",
    version: "RabbitMQ engine version (default: `3.8`). Alias: `engine_version`.",
  },
  nosql: {
    flavor: "GeminiDB node size (`large.4`, `xlarge.4`, `2xlarge.4`, `4xlarge.4`, `8xlarge.4`). Can also be synthesized from `needs: { vcpus }`.",
    nodes: "Cluster node count (2–200). Alias: `replicas`.",
    storage_gb: "Storage space in GB (≥ 100 GB).",
    engine: "NoSQL API engine (`dynamodb`).",
  },
  cci: {
    vcpu: "Container vCPU allocation (1–512). In declarative `version: \"1\"`, write `vcpus: 4` or `needs: { vcpus: 4 }`.",
    mem_gb: "Container memory allocation in GB (1–512 GB). In declarative `version: \"1\"`, write `memory_gb: \"8 GiB\"` or `needs: { memory: \"8 GiB\" }`.",
  },
  elb: {
    public_ip_count: "Load balancer network type selector: `1` = Public Network (Internet-facing with dynamic BGP EIP), `2` = Private Network (internal VPC). In declarative quotes, write `network_type: public` or `public: true`.",
    hours: "Operating duration in hours (default: 730).",
  },
  cbr: {
    vault_spec: "Backup vault specification SKU (`vault.backup.server.normal`, `vault.backup.server.multiaz`, `vault.backup.volume.normal`, `vault.backup.database.normal`, `vault.backup.turbo.normal`). In declarative quotes, write `vault_type: server` or `vault_type: disk`.",
    size_gb: "Backup vault storage capacity in GB (10–10,485,760 GB). In declarative quotes, write `capacity: \"4 TB\"`.",
  },
  maas: {
    input_mtokens: "Monthly input tokens in units of million tokens (e.g. `50` for 50 million tokens). In declarative quotes, write `input_tokens: 50M` or `tokens_thousands: 50000`.",
    output_mtokens: "Monthly generated output tokens in units of million tokens (e.g. `10` for 10 million tokens). In declarative quotes, write `output_tokens: 10M`.",
    cached_input_mtokens: "Monthly prompt cache hit input tokens in units of million tokens (e.g. `20` for 20 million tokens). Billed at a discounted cache rate.",
    reasoning_mode: "Inference mode (`standard`). Automatically populated from the catalog model SKU.",
    model_service_type: "Model service class (`system`). Automatically populated from the catalog model SKU.",
    model_series: "Model family series (`deepseek`, `glm`). Automatically populated from the catalog model SKU.",
    model_name: "Catalog model name (e.g. `deepseek-v3`, `deepseek-r1`). In declarative quotes, select via `options.model: deepseek-v3` or `spec`.",
    billing_mode_type: "Pricing dimension (`tokens`). Automatically populated from the catalog model SKU.",
  },
  function: {
    requests_10k: "Average monthly invocations in units of 10,000 counts (e.g. `1000` = 10,000,000 invocations). In declarative quotes, write `requests: 10M` or `invocations: 10M`.",
    memory_mb: "Memory allocated per function instance (128 MB to 1024 MB). Default: `512`.",
    compute: "Execution compute units / duration (measured in GB-seconds or duration multiplier). In declarative quotes, write `execution_time_ms: 200` or `compute_units: 100`.",
  },
  lts: {
    flow_gb_per_day: "Daily raw log ingestion volume in GB/day (1–9,999,999,999 GB/day). In declarative quotes, write `monthly_flow: 300 GB` (automatically divided by 30 days).",
    retention_days: "Log storage retention duration in days (1–365). Default: `30`.",
    index_percent: "Percentage of ingested log data indexed for full-text query (1–100%). Default: `100`.",
    cold_enabled: "Enable automated lifecycle to low-cost intelligent cold storage (`true` or `false`).",
    hot_retention_days: "Duration in days to retain logs in hot storage before migrating to cold storage (1–365). Requires `cold_enabled: true`.",
    total_retention_days: "Total combined retention duration (hot + cold) in days (1–365). Requires `cold_enabled: true`.",
    transfer_basic_gb_per_day: "Daily log transfer volume via basic streaming in GB/day.",
    transfer_senior_gb_per_day: "Daily log transfer volume via advanced streaming in GB/day.",
    months: "Evaluation duration in months (1–60) for pay-per-use calculation.",
  },
  apm: {
    spec: "APM 2.0 instance specification (`apm2.instance.normal`). In declarative quotes, write `instances: 5` or `probe_days: 150`.",
  },
  hecs: {
    image: "Operating system image label (e.g. `AlmaLinux 9.4 64bit`, `Ubuntu 22.04 server 64bit`).",
    system_disk: "System disk specification `[TYPE, SIZE_GB]` (e.g. `[GPSSD, 40]`). Types: `GPSSD`, `SAS`, `SSD`.",
    bandwidth_mbit: "Public EIP bandwidth in Mbit/s (1–2000 Mbit/s).",
  },
  nat: {
    size: "NAT gateway scale: `small` (10k conns), `middle` / `medium` (50k conns), `large` (200k conns), `xlarge` (1M conns). Aliases: `s`, `m`, `l`, `xl`.",
  },
  eip: {
    ip_quantity: "Number of public IP addresses (1–99). In declarative quotes, write `count: 1` or `quantity: 1`.",
    bandwidth_mbps: "Dedicated public IP bandwidth in Mbit/s (1–2000 Mbit/s for BGP). In declarative quotes, write `bandwidth: 10 Mbps`.",
  },
  er: {
    downflow_gb: "Monthly routed data traffic through Enterprise Router in GB. In declarative quotes, write `traffic: \"500 GB\"` or `traffic_gb: 500`.",
    attachments: "Number of connected VPC or gateway attachments (≥ 1; default: 2). Alias: `connections`.",
    attachment_hours: "Attachment operating duration in hours (default: 730). Alias: `hours`.",
  },
  vpcep: {
    duration_hours: "VPC endpoint instance operating duration in hours (default: 730). In declarative quotes, write `hours: 730` or `endpoints: 2`.",
  },
  vpn: {
    spec: "VPN gateway specification (`Basic`, `Professional1`, `Professional2`).",
    connection_groups: "Number of IPsec VPN connection groups (default: 10; max 100). Alias: `connections`.",
    eip1_mbps: "Primary active tunnel EIP bandwidth in Mbit/s (1–300 Mbit/s). In declarative quotes, write `bandwidth: 20 Mbps` (sets both tunnels).",
    eip2_mbps: "Secondary active tunnel EIP bandwidth in Mbit/s (1–300 Mbit/s).",
  },
  dline: {
    port: "Direct Connect physical port speed: `1ge` (1 Gbps), `10ge` (10 Gbps), `40ge` (40 Gbps), or `100ge` (100 Gbps). In declarative quotes, write `bandwidth: 10 Gbps`.",
  },
  cfw: {
    edition: "Firewall edition token: `detail_3_` for Standard, `detail_11_` for Professional. In declarative quotes, write `edition: standard` or `edition: professional`.",
    bandwidth_mbps: "Additional internet border protection bandwidth in Mbit/s (in 5 Mbit/s increments). Alias: `protection_bandwidth_mbps`.",
    eips: "Additional protected public IP addresses beyond the edition baseline. Alias: `protected_eips`.",
  },
  hss: {
    edition: "Host security tier token (`dataInfo_1_` Basic, `dataInfo_6_` Enterprise, `dataInfo_4_` Premium, `dataInfo_3_` WTP, `dataInfo_5_` Container). In declarative quotes, write `edition: premium` or `edition: enterprise`.",
  },
  rdsformariadb: {
    instance_type: "MariaDB topology: `Ha` (Primary/Standby) or `Single`. In declarative quotes, write `topology: primary-standby`.",
    db_version: "MariaDB engine release version (e.g. `10.5`, `10.4`). Alias: `version`.",
    public_type: "Instance class: `general` (General-purpose) or `dedicated` (Dedicated).",
    spec: "MariaDB compute SKU (e.g. `mariadb.x1.large.4.ha`).",
    storage_gb: "Database storage capacity in GB (40–4,000 GB, in 10 GB increments).",
  },
  taurusdb: {
    enterprise_instance: "TaurusDB topology: `standard` (Primary/Standby) or `multi-master`. In declarative quotes, write `topology: standard`.",
    nodes: "Total cluster node count including primary and read replicas (2–10 nodes). Alias: `replicas` (node count = replicas + 1).",
    public_type: "Instance specification class (`x86.4`).",
    spec: "TaurusDB compute SKU (e.g. `gaussdb.mysql.large.x86.4`).",
    storage_gb: "Cluster storage capacity in GB (10–128,000 GB, in 10 GB increments).",
  },
  gaussdb: {
    deploy_model: "Deployment architecture: `centralized` (Primary/Standby) or `distributed` (Sharded cluster). In declarative quotes, write `deployment_mode: centralized`.",
    instance_type: "Component deployment model: `independent` (separate CN/DN) or `combined`.",
    db_version: "openGauss engine version (e.g. `3.200`). Alias: `version`.",
    database_type: "Database engine type (`openGauss`).",
    public_type: "Compute specification family (`x86` or `arm`).",
    spec: "GaussDB compute SKU (e.g. `gaussdb.bs.c6.4xlarge.x864.ha`).",
    storage_gb: "Data node disk capacity in GB (40–24,000 GB, in 4 GB increments).",
  },
  hrds: {
    db_type: "Relational database engine: `mysql`, `postgresql`, or `sqlserver`. In declarative quotes, write `needs: { engine: mysql }`.",
    instance_type: "Dedicated instance topology: `ha` (Primary/Standby) or `single`.",
    db_version: "Database engine version (e.g. `8.0` for MySQL, `14` for PostgreSQL). Alias: `version`.",
    spec: "Dedicated RDS y1 family SKU (e.g. `rds.mysql.y1.large.2.ha`).",
    storage_gb: "Dedicated database disk capacity in GB (120–4,000 GB, in 10 GB increments).",
  },
  dds: {
    type: "Document database topology: `ReplicaSet` (3-node Replica Set) or `Cluster` (Sharded Cluster). In declarative quotes, write `topology: replica-set`.",
    flavor_type: "Compute specification family: `dedicated` or `general-purpose`.",
    shard_spec: "Compute flavor SKU for shard nodes (e.g. `dds.mongodb.c6.large.8.shard`).",
    shards: "Number of shard clusters (2–32). Applicable only in `Cluster` mode. Alias: `nodes`.",
    shard_storage_gb: "Storage capacity per shard node in GB (10–5,000 GB). In ReplicaSet mode, represents node storage.",
  },
  memcached: {
    instance_type: "Cache topology: `single_node` or `master_standby` (High Availability). In declarative quotes, write `topology: master-standby`.",
    memory_gb: "Cache memory capacity in GB (minimum 2 GB). Alias: `capacity_gb`.",
  },
  ddm: {
    spec_type: "Instance class: `c6` (High-performance) or `s6` (General-purpose).",
    spec: "Node specification code (e.g. `ddm.c6.2xlarge.2` for 8 vCPUs / 16 GB). Node count is configured via card `quantity` (≥ 2).",
  },
  drs: {
    type: "Replication task category: `migration` (Real-time Migration), `sync` (Real-time Sync), or `dr` (Disaster Recovery).",
    flow: "Data movement direction: `into_cloud` (inbound), `out_of_cloud` (egress), or `in_cloud` (inter-VPC). Alias: `direction`.",
    specification: "Task worker scale: `micro`, `small`, `medium`, `large`, or `xlarge`. Alias: `scale`.",
  },
  sfs: {
    capacity_gb: "Standard shared file system capacity in GB (minimum 1 GB). In declarative quotes, write `capacity: \"1000 GB\"` or `size_gb: 1000`.",
  },
  dss: {
    type: "Dedicated storage pool media type: `SAS` (High I/O) or `SSD` (Ultra-high I/O).",
    capacity: "Discrete dedicated pool division size (e.g. `43.350 TB` for SAS, `13.600 TB` for SSD).",
  },
  sdrs: {
    protection_groups: "Number of protected disaster recovery replication instances (1–1000). In declarative quotes, write `dr_pairs: 2` or `protected_instances: 2`.",
  },
  des: {
    transfer_type: "Transmission mode: `teleport` (Huawei Teleport device) or `disk` (customer physical hard drives). Alias: `mode`.",
    devices: "Teleport onsite usage duration in days (1–99 days; Teleport mode only). In declarative quotes, write `onsite_days: 5` (deprecating the confusing option name `devices`).",
  },
  apig: {
    edition: "API Gateway dedicated instance tier: `BASIC` (2,000 TPS), `PROFESSIONAL` (10,000 TPS), `ENTERPRISE` (20,000 TPS), or `PLATINUM` (50,000 TPS).",
    hours: "Operating duration in hours (default: 730).",
  },
  ssa: {
    edition: "SecMaster / SSA edition: `basic`, `standard`, or `professional`.",
  },
  cc: {
    note: "Cloud Connect provides cross-region and global VPC interconnection. Currently priced via default portal baseline package.",
  },
  esw: {
    note: "Enterprise Switch provides L2 interconnection between VPC and on-premises data centers. Priced via default instance configuration.",
  },
  ga: {
    note: "Global Accelerator provides global traffic acceleration with anycast public IPs. Priced via default acceleration configuration.",
  },
  aad: {
    note: "Anti-DDoS Advanced provides dedicated Tbps-scale DDoS mitigation. Priced via default enterprise package.",
  },
  dbss: {
    note: "Database Security Service provides relational database audit and compliance monitoring. Priced via default instance tier.",
  },
  dsc: {
    note: "Data Security Center provides data classification, desensitization, and privacy compliance. Priced via default service tier.",
  },
  edgesec: {
    note: "Edge Security provides integrated DDoS, WAF, and bot protection at CDN edge nodes. Priced via default edge policy package.",
  },
  ucs: {
    note: "Ubiquitous Cloud Native Service provides distributed multi-cloud Kubernetes fleet management. Priced via baseline enrollment.",
  },
  reliability: {
    note: "DMS Reliability Queue provides enterprise active-standby message queue assurance. Priced via default queue configuration.",
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
