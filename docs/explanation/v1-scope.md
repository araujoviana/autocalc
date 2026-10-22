# v1 scope: which services count

v1 ([ADR-0015](../adr/0015-strangler-core-and-aws-second.md)) means at least half of the
**quotable** Huawei services are *verified*: `publish_quote` saves a page-encoded card whose
stored price equals its Edit price and its rating-engine price, in every billing mode the
service sells (or the mode is documented as unsupported).

## What counts as quotable

A service is quotable when the calculator prices it in the catalog and a quote for it shows a
recurring resource a customer could buy. Services are left out only for one of these reasons,
listed per row: no priced SKU, a one-time purchase, a support contract, a professional service.
Checked live on 2026-10-17: the catalog lists 97 services;
4 are not counted, so **93 count and the v1 target is 47**.

| Status | Services |
|---|---|
| verified | 45 |
| wave 2 | 0 |
| wave 3 | 0 |
| later | 48 |
| not counted | 4 |

Verified plus the AI, analytics, media and developer-services forms, which are the oddest, stay
short of the target: 45 are verified after wave 3, so **2 more** are needed (a wave 4 from the
*later* rows, e.g. the ones that failed below). Waves are an order of work, not a promise: a
service moves to *later* if its form cannot be replayed or its Edit view cannot reproduce the
stored price.

Wave 3 left eight services in *later*: `ga`, `cc`, `aad`, `edgesec`, `ucs` (their pages have no
region control, which the encoder requires), `cbh` (monthly and yearly cards come back with
unpriced products in `sa-brazil-1`), `hcss` (Edit re-prices to 11.40 monthly where stored is
3.50) and `ccm` (one-time purchase only, no recurring mode). `ssa` is verified on-demand only,
and `dsc` monthly and yearly only (its on-demand Edit does not restore the period).

Waves 1 (the builders that already existed) and 2 (databases and storage, driven by form recipes) are done: see the results in
[ADR-0001](../adr/0001-page-as-encoder.md). Wave 3 (networking, security, middleware) is done too.

## Every service

| Category | Service | Name | Status |
|---|---|---|---|
| AI | `cbs` | Conversational Bot Service | later |
| AI | `ges` | Graph Engine Service | later |
| AI | `image` | Images Recognition | later |
| AI | `maas` | MaaS | not counted: no priced SKU in the catalog |
| AI | `modelarts` | ModelArts | later |
| AI | `moderation` | Content Moderation | later |
| AI | `ocr` | Optical Character Recognition | later |
| AI | `sis` | Speech Interaction Service | later |
| AI | `vias` | Video Intelligent Analysis Service | later |
| Analytics | `dgcCdm` | DataArts Migration Incremental Package | later |
| Analytics | `dis` | Data Ingestion Service | later |
| Analytics | `dlg` | DataArts Studio | later |
| Analytics | `dli` | Data Lake Insight | later |
| Analytics | `dlm` | DataArts DataService Incremental Package | later |
| Analytics | `dws` | Data Warehouse Service | later |
| Analytics | `lakeformation` | DataArts Lake Formation | later |
| Analytics | `mrs` | MapReduce Service | later |
| Analytics | `search` | Cloud Search Service | later |
| Blockchain | `bcs` | Blockchain Service | later |
| Business Applications | `cec` | Customer Engagement Center | later |
| Business Applications | `romaconnect` | ROMA Connect | later |
| Business Applications | `vc` | HUAWEI CLOUD Meeting | later |
| Business Applications | `workspace` | Workspace | later |
| Compute | `dcc` | Dedicated Computing Cluster | later |
| Compute | `deh` | Dedicated Host | later |
| Compute | `ecs` | Elastic Cloud Server | verified |
| Compute | `function` | FunctionGraph | verified |
| Compute | `hcss` | Flexus L Instance | later |
| Compute | `hecs` | Flexus X Instance | verified |
| Containers | `cce` | Cloud Container Engine | verified |
| Containers | `cci` | Cloud Container Instance | verified |
| Containers | `ucs` | Ubiquitous Cloud Native Service | later |
| Content Delivery & Edge Computing | `cdn` | Content Delivery Network | later |
| Content Delivery & Edge Computing | `wsa` | Whole Site Acceleration | later |
| Databases | `ddm` | Distributed Database Middleware | verified |
| Databases | `dds` | Document Database Service | verified |
| Databases | `drs` | Data Replication Service | verified |
| Databases | `gaussdb` | GaussDB | verified |
| Databases | `hrds` | Flexus RDS | verified |
| Databases | `memcached` | DCS (for Memcached) | verified |
| Databases | `nosql` | GeminiDB | verified |
| Databases | `rds` | Relational Database Service | verified |
| Databases | `rdsformariadb` | RDS for MariaDB | verified |
| Databases | `redis` | DCS (for Redis) | verified |
| Databases | `taurusdb` | TaurusDB | verified |
| Developer Services | `astrozero` | Huawei Cloud Astro Zero | later |
| Developer Services | `devcloud` | CodeArts | later |
| Developer Services | `servicestage` | ServiceStage | later |
| IoT | `gsl` | Global SIM Link | not counted: one-time SIM purchase, not a recurring quote |
| IoT | `iotda` | IoT Device Access | later |
| MacroVerse aPaaS | `koomessage` | KooMessage | later |
| Management & Governance | `aom` | Application Operations Management | later |
| Management & Governance | `apm` | Application Performance Management | verified |
| Management & Governance | `lts` | Log Tank Service | verified |
| Media Services | `cloudrtc` | Huawei Cloud Real-Time Communication | later |
| Media Services | `live` | Live | later |
| Media Services | `mpc` | Media Processing Center | later |
| Media Services | `vod` | Video on Demand | later |
| Middleware | `apig` | API Gateway | verified |
| Middleware | `cse` | Cloud Service Engine | later |
| Middleware | `eg` | EventGrid | later |
| Middleware | `kafka` | DMS (for Kafka) | verified |
| Middleware | `mas` | Multi-Site High Availability Service | later |
| Middleware | `rabbitMQ` | DMS (for RabbitMQ) | verified |
| Middleware | `reliability` | DMS (for RocketMQ) | verified |
| Migration | `cdm` | Cloud Data Migration | later |
| Networking | `cc` | Cloud Connect | later |
| Networking | `dline` | Direct Connect As A Service | verified |
| Networking | `eip` | Elastic IP | verified |
| Networking | `elb` | Elastic Load Balance | verified |
| Networking | `er` | Enterprise Router | verified |
| Networking | `esw` | Enterprise Switch | verified |
| Networking | `ga` | Global Accelerator | later |
| Networking | `nat` | NAT Gateway | verified |
| Networking | `vpcep` | VPC Endpoint | verified |
| Networking | `vpn` | Virtual Private Network | verified |
| Professional Services | `hcoms` | HUAWEI CLOUD O&M Service | not counted: a professional service, not a resource |
| Security & Compliance | `aad` | Anti-DDoS Service | later |
| Security & Compliance | `cbh` | Cloud Bastion Host | later |
| Security & Compliance | `ccm` | Cloud Certificate & Manager | later |
| Security & Compliance | `cfw` | Cloud Firewall | verified |
| Security & Compliance | `dbss` | Database Security Service | verified |
| Security & Compliance | `dew` | Data Encryption Workshop | verified |
| Security & Compliance | `dsc` | Data Security Center | verified |
| Security & Compliance | `edgesec` | Edge Security | later |
| Security & Compliance | `hss` | Host Security Service | verified |
| Security & Compliance | `ssa` | SecMaster | verified |
| Security & Compliance | `waf` | Web Application Firewall | verified |
| Storage | `cbr` | Cloud Backup and Recovery | verified |
| Storage | `des` | Data Express Service | verified |
| Storage | `dss` | Dedicated Distributed Storage Service | verified |
| Storage | `evs` | Elastic Volume Service | verified |
| Storage | `obs` | Object Storage Service | verified |
| Storage | `sdrs` | Business Recovery Service | verified |
| Storage | `sfs` | Scalable File Service | verified |
| Storage | `sfsturbo` | Scalable File Service Turbo | verified |
| Support | `supportplans` | Support Plans | not counted: a support contract, not a resource |
