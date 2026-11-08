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
| [`ecs`](ecs.md) | Elastic Cloud Server | — | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`function`](function.md) | FunctionGraph | `fg`, `functiongraph` | `ondemand` | `VERIFIED` |
| [`hecs`](hecs.md) | Flexus X Instance | — | `monthly`, `yearly`, `ondemand` | `DEFAULT_ONLY` |

### Containers

Managed Kubernetes clusters, serverless container instances, and multi-cloud container fleets.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`cce`](cce.md) | Cloud Container Engine | — | `ondemand`, `monthly`, `yearly` | `VERIFIED` |
| [`cci`](cci.md) | Cloud Container Instance | — | `ondemand` | `VERIFIED` |
| [`ucs`](ucs.md) | Ubiquitous Cloud Native Service | — | `monthly`, `yearly`, `ondemand` | `DEFAULT_ONLY` |

### Databases & Cache

Relational, NoSQL, document, distributed databases, caching, and data replication services.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`rds`](rds.md) | Relational Database Service | — | `ondemand`, `monthly`, `yearly` | `VERIFIED` |
| [`rdsformariadb`](rdsformariadb.md) | RDS for MariaDB | `mariadb` | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`taurusdb`](taurusdb.md) | TaurusDB | — | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`gaussdb`](gaussdb.md) | GaussDB | — | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`hrds`](hrds.md) | Dedicated RDS | — | `monthly`, `yearly` | `VERIFIED` |
| [`dds`](dds.md) | Document Database Service | `mongodb` | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`nosql`](nosql.md) | GeminiDB DynamoDB | `geminidb` | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`redis`](redis.md) | Distributed Cache Service (Redis) | `dcs` | `monthly`, `yearly` | `VERIFIED` |
| [`memcached`](memcached.md) | Distributed Cache Service (Memcached) | — | `ondemand` | `VERIFIED` |
| [`ddm`](ddm.md) | Distributed Database Middleware | — | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`drs`](drs.md) | Data Replication Service | — | `monthly`, `yearly`, `ondemand` | `VERIFIED` |

### Storage & Backup

Block volumes, object storage, network file systems, cloud backup vaults, and disaster recovery.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`evs`](evs.md) | Elastic Volume Service | — | `ondemand`, `monthly`, `yearly` | `VERIFIED` |
| [`obs`](obs.md) | Object Storage Service | — | `ondemand`, `monthly`, `yearly` | `VERIFIED` |
| [`sfs`](sfs.md) | Scalable File Service | — | `ondemand` | `VERIFIED` |
| [`sfsturbo`](sfsturbo.md) | Scalable File Service Turbo | `sfs-turbo`, `sfs_turbo` | `ondemand`, `monthly`, `yearly` | `VERIFIED` |
| [`cbr`](cbr.md) | Cloud Backup and Recovery | — | `ondemand`, `monthly`, `yearly` | `VERIFIED` |
| [`sdrs`](sdrs.md) | Storage Disaster Recovery Service | — | `ondemand` | `VERIFIED` |
| [`dss`](dss.md) | Dedicated Distributed Storage Service | — | `yearly` | `VERIFIED` |
| [`des`](des.md) | Data Express Service | — | `ondemand` | `VERIFIED` |

### Networking & Edge

Load balancers, NAT gateways, elastic IPs, enterprise routers, VPNs, and direct interconnects.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`elb`](elb.md) | Elastic Load Balance | — | `ondemand`, `monthly`, `yearly` | `VERIFIED` |
| [`nat`](nat.md) | NAT Gateway | — | `ondemand`, `monthly`, `yearly` | `VERIFIED` |
| [`eip`](eip.md) | Elastic IP | — | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`er`](er.md) | Enterprise Router | — | `ondemand` | `VERIFIED` |
| [`vpcep`](vpcep.md) | VPC Endpoint | — | `ondemand` | `VERIFIED` |
| [`vpn`](vpn.md) | Virtual Private Network | — | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`dline`](dline.md) | Cloud Connect / Direct Connect As A Service | `dc`, `direct-connect`, `direct_connect` | `monthly`, `yearly` | `VERIFIED` |
| [`cc`](cc.md) | Cloud Connect | — | `monthly`, `yearly` | `DEFAULT_ONLY` |
| [`esw`](esw.md) | Enterprise Switch | — | `monthly`, `yearly`, `ondemand` | `DEFAULT_ONLY` |
| [`ga`](ga.md) | Global Accelerator | — | `ondemand` | `DEFAULT_ONLY` |

### Middleware & Messaging

API gateways and managed Kafka and RabbitMQ message brokers.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`apig`](apig.md) | API Gateway | — | `ondemand` | `VERIFIED` |
| [`kafka`](kafka.md) | DMS (for Kafka) | `dmq`, `dms-kafka` | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`rabbitmq`](rabbitmq.md) | DMS (for RabbitMQ) | `dms-rabbitmq` | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`reliability`](reliability.md) | Reliability (Distributed Message Service) | — | `monthly`, `yearly`, `ondemand` | `DEFAULT_ONLY` |

### Security & Compliance

Web application firewalls, cloud firewalls, host security, KMS encryption, and DDoS protection.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`waf`](waf.md) | Web Application Firewall | — | `ondemand` | `VERIFIED` |
| [`cfw`](cfw.md) | Cloud Firewall | — | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`hss`](hss.md) | Host Security Service | — | `monthly`, `yearly`, `ondemand` | `VERIFIED` |
| [`dew`](dew.md) | Data Encryption Workshop | `kms` | `ondemand` | `VERIFIED` |
| [`ssa`](ssa.md) | Situation Awareness | — | `ondemand` | `CATALOG_ONLY` |
| [`aad`](aad.md) | Anti-DDoS Advanced | — | `monthly`, `yearly` | `DEFAULT_ONLY` |
| [`dbss`](dbss.md) | Database Security Service | — | `monthly`, `yearly` | `DEFAULT_ONLY` |
| [`dsc`](dsc.md) | Data Security Center | — | `monthly`, `yearly` | `DEFAULT_ONLY` |
| [`edgesec`](edgesec.md) | Edge Security | — | `monthly` | `DEFAULT_ONLY` |

### Observability & AI

Log management, application performance monitoring, and ModelArts Studio token inference.

| Service | Name | Declarative Aliases | Billing Modes | Publish Gate |
| :--- | :--- | :--- | :--- | :--- |
| [`lts`](lts.md) | Log Tank Service | — | `ondemand` | `VERIFIED` |
| [`apm`](apm.md) | Application Performance Management | — | `ondemand` | `VERIFIED` |
| [`maas`](maas.md) | Model as a Service (ModelArts Studio) | — | `ondemand` | `VERIFIED` |
