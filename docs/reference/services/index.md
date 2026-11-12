# Huawei Cloud Service Catalog

This section is the **Terraform Registry-style provider reference** for all **51 Huawei Cloud calculator services** in `autocalc`.

Every service page documents:
- **Example Usage**: Ready-to-use `version: "1"` declarative YAML snippets.
- **Argument Reference**: Legal `needs`, `spec`, and `options` fields, types, and UI stepper ranges.
- **Behavioral Rules & Constraints**: Single-quantity restrictions, anti-splitting invariants (`FIXED_BASE_COST_SERVICES`), usage-pricing rules, and known vendor portal defects.
- **Portal Control Schema**: The complete widget mapping from `src/schema/files/<service>.yaml` (also exposed via MCP as `autocalc://schema/<service>`).
- **Live Compatibility Replay**: Scenario-by-scenario replay results against frontend `11.4.201`.

> **Keeping this catalog in sync**: Regenerate all service pages from the schemas and compatibility reports with `bun run docs:generate`.

---

## Verification Tiers

- **`VERIFIED` (40 services)**: 100% control mapping coverage in `src/schema/files/*.yaml` and full support in `plan-quote` / `apply-quote` through the 3-way fail-closed publish gate (`stored == rated == Edit`).
- **`DEFAULT_ONLY` / `CATALOG_ONLY` (11 services)**: Supported for catalog search (`autocalc search`), standalone rating (`autocalc quote`), and anonymous replay (`bun run compat`), but blocked from `apply-quote` / `publish-quote` until custom option or spec mappings are verified against the Edit gate.

---

### Compute

Virtual machines, serverless functions, and dedicated compute instances.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`ecs`](ecs.md) | Elastic Cloud Server | — | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`function`](function.md) | FunctionGraph | `fg`, `functiongraph` | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`hecs`](hecs.md) | Flexus X Instance | `flexus`, `flexus-x`, `flexus_x` | `monthly`, `yearly`, `ondemand` | <span class="badge badge--default">DEFAULT_ONLY</span> |

### Containers

Managed Kubernetes clusters, serverless container instances, and multi-cloud container fleets.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`cce`](cce.md) | Cloud Container Engine | — | `ondemand`, `monthly`, `yearly` | <span class="badge badge--verified">VERIFIED</span> |
| [`cci`](cci.md) | Cloud Container Instance | — | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`ucs`](ucs.md) | Ubiquitous Cloud Native Service | — | `monthly`, `yearly`, `ondemand` | <span class="badge badge--default">DEFAULT_ONLY</span> |

### Databases & Cache

Relational, NoSQL, document, distributed databases, caching, and data replication services.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`rds`](rds.md) | Relational Database Service | — | `ondemand`, `monthly`, `yearly` | <span class="badge badge--verified">VERIFIED</span> |
| [`rdsformariadb`](rdsformariadb.md) | RDS for MariaDB | `mariadb` | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`taurusdb`](taurusdb.md) | TaurusDB | — | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`gaussdb`](gaussdb.md) | GaussDB | — | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`hrds`](hrds.md) | Dedicated RDS | — | `monthly`, `yearly` | <span class="badge badge--verified">VERIFIED</span> |
| [`dds`](dds.md) | Document Database Service | `mongodb` | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`nosql`](nosql.md) | GeminiDB DynamoDB | `geminidb` | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`redis`](redis.md) | Distributed Cache Service (Redis) | `dcs` | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`memcached`](memcached.md) | Distributed Cache Service (Memcached) | — | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`ddm`](ddm.md) | Distributed Database Middleware | — | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`drs`](drs.md) | Data Replication Service | — | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |

### Storage & Backup

Block volumes, object storage, network file systems, cloud backup vaults, and disaster recovery.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`evs`](evs.md) | Elastic Volume Service | — | `ondemand`, `monthly`, `yearly` | <span class="badge badge--verified">VERIFIED</span> |
| [`obs`](obs.md) | Object Storage Service | — | `ondemand`, `monthly`, `yearly` | <span class="badge badge--verified">VERIFIED</span> |
| [`sfs`](sfs.md) | Scalable File Service | — | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`sfsturbo`](sfsturbo.md) | Scalable File Service Turbo | `sfs-turbo`, `sfs_turbo` | `ondemand`, `monthly`, `yearly` | <span class="badge badge--verified">VERIFIED</span> |
| [`cbr`](cbr.md) | Cloud Backup and Recovery | — | `ondemand`, `monthly`, `yearly` | <span class="badge badge--verified">VERIFIED</span> |
| [`sdrs`](sdrs.md) | Storage Disaster Recovery Service | — | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`dss`](dss.md) | Dedicated Distributed Storage Service | — | `yearly` | <span class="badge badge--verified">VERIFIED</span> |
| [`des`](des.md) | Data Express Service | — | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |

### Networking & Edge

Load balancers, NAT gateways, elastic IPs, enterprise routers, VPNs, and direct interconnects.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`elb`](elb.md) | Elastic Load Balance | — | `ondemand`, `monthly`, `yearly` | <span class="badge badge--verified">VERIFIED</span> |
| [`nat`](nat.md) | NAT Gateway | — | `ondemand`, `monthly`, `yearly` | <span class="badge badge--verified">VERIFIED</span> |
| [`eip`](eip.md) | Elastic IP | — | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`er`](er.md) | Enterprise Router | — | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`vpcep`](vpcep.md) | VPC Endpoint | — | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`vpn`](vpn.md) | Virtual Private Network | — | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`dline`](dline.md) | Cloud Connect / Direct Connect As A Service | `dc`, `direct-connect`, `direct_connect` | `monthly`, `yearly` | <span class="badge badge--verified">VERIFIED</span> |
| [`cc`](cc.md) | Cloud Connect | — | `monthly`, `yearly` | <span class="badge badge--default">DEFAULT_ONLY</span> |
| [`esw`](esw.md) | Enterprise Switch | — | `monthly`, `yearly`, `ondemand` | <span class="badge badge--default">DEFAULT_ONLY</span> |
| [`ga`](ga.md) | Global Accelerator | — | `ondemand` | <span class="badge badge--default">DEFAULT_ONLY</span> |

### Middleware & Messaging

API gateways and managed Kafka and RabbitMQ message brokers.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`apig`](apig.md) | API Gateway | — | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`kafka`](kafka.md) | DMS (for Kafka) | `dmq`, `dms-kafka` | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`rabbitmq`](rabbitmq.md) | DMS (for RabbitMQ) | `dms-rabbitmq` | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`reliability`](reliability.md) | Reliability (Distributed Message Service) | — | `monthly`, `yearly`, `ondemand` | <span class="badge badge--default">DEFAULT_ONLY</span> |

### Security & Compliance

Web application firewalls, cloud firewalls, host security, KMS encryption, and DDoS protection.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`waf`](waf.md) | Web Application Firewall | — | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`cfw`](cfw.md) | Cloud Firewall | — | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`hss`](hss.md) | Host Security Service | — | `monthly`, `yearly`, `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`dew`](dew.md) | Data Encryption Workshop | `csms`, `kms` | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`ssa`](ssa.md) | Situation Awareness | `secmaster` | `ondemand` | <span class="badge badge--default">CATALOG_ONLY</span> |
| [`aad`](aad.md) | Anti-DDoS Advanced | — | `monthly`, `yearly` | <span class="badge badge--default">DEFAULT_ONLY</span> |
| [`dbss`](dbss.md) | Database Security Service | — | `monthly`, `yearly` | <span class="badge badge--default">DEFAULT_ONLY</span> |
| [`dsc`](dsc.md) | Data Security Center | — | `monthly`, `yearly` | <span class="badge badge--default">DEFAULT_ONLY</span> |
| [`edgesec`](edgesec.md) | Edge Security | — | `monthly` | <span class="badge badge--default">DEFAULT_ONLY</span> |

### Observability & AI

Log management, application performance monitoring, and ModelArts Studio token inference.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`lts`](lts.md) | Log Tank Service | — | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`apm`](apm.md) | Application Performance Management | — | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
| [`maas`](maas.md) | Model as a Service (ModelArts Studio) | — | `ondemand` | <span class="badge badge--verified">VERIFIED</span> |
