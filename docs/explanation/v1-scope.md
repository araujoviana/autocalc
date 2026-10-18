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
| verified | 20 |
| wave 2 | 13 |
| wave 3 | 20 |
| later | 40 |
| not counted | 4 |

Verified plus waves 2 and 3 give 53 services, enough for the target without the AI, analytics, media or
developer-services forms, which are the oddest. Waves are an order of work, not a promise: a
service moves to *later* if its form cannot be replayed or its Edit view cannot reproduce the
stored price.

Wave 1 (the builders that already existed) is done: see the result in
[ADR-0001](../adr/0001-page-as-encoder.md). Waves 2 and 3 group by form shape (databases and storage, then networking, security and middleware).

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
| Compute | `hcss` | Flexus L Instance | wave 3 |
| Compute | `hecs` | Flexus X Instance | wave 3 |
| Containers | `cce` | Cloud Container Engine | verified |
| Containers | `cci` | Cloud Container Instance | verified |
| Containers | `ucs` | Ubiquitous Cloud Native Service | wave 3 |
| Content Delivery & Edge Computing | `cdn` | Content Delivery Network | later |
| Content Delivery & Edge Computing | `wsa` | Whole Site Acceleration | later |
| Databases | `ddm` | Distributed Database Middleware | wave 2 |
| Databases | `dds` | Document Database Service | wave 2 |
| Databases | `drs` | Data Replication Service | wave 2 |
| Databases | `gaussdb` | GaussDB | wave 2 |
| Databases | `hrds` | Flexus RDS | wave 2 |
| Databases | `memcached` | DCS (for Memcached) | wave 2 |
| Databases | `nosql` | GeminiDB | verified |
| Databases | `rds` | Relational Database Service | verified |
| Databases | `rdsformariadb` | RDS for MariaDB | wave 2 |
| Databases | `redis` | DCS (for Redis) | wave 2 |
| Databases | `taurusdb` | TaurusDB | wave 2 |
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
| Middleware | `reliability` | DMS (for RocketMQ) | wave 3 |
| Migration | `cdm` | Cloud Data Migration | later |
| Networking | `cc` | Cloud Connect | wave 3 |
| Networking | `dline` | Direct Connect As A Service | verified |
| Networking | `eip` | Elastic IP | wave 3 |
| Networking | `elb` | Elastic Load Balance | verified |
| Networking | `er` | Enterprise Router | wave 3 |
| Networking | `esw` | Enterprise Switch | wave 3 |
| Networking | `ga` | Global Accelerator | wave 3 |
| Networking | `nat` | NAT Gateway | verified |
| Networking | `vpcep` | VPC Endpoint | wave 3 |
| Networking | `vpn` | Virtual Private Network | wave 3 |
| Professional Services | `hcoms` | HUAWEI CLOUD O&M Service | not counted: a professional service, not a resource |
| Security & Compliance | `aad` | Anti-DDoS Service | wave 3 |
| Security & Compliance | `cbh` | Cloud Bastion Host | wave 3 |
| Security & Compliance | `ccm` | Cloud Certificate & Manager | wave 3 |
| Security & Compliance | `cfw` | Cloud Firewall | wave 3 |
| Security & Compliance | `dbss` | Database Security Service | wave 3 |
| Security & Compliance | `dew` | Data Encryption Workshop | verified |
| Security & Compliance | `dsc` | Data Security Center | wave 3 |
| Security & Compliance | `edgesec` | Edge Security | wave 3 |
| Security & Compliance | `hss` | Host Security Service | wave 3 |
| Security & Compliance | `ssa` | SecMaster | wave 3 |
| Security & Compliance | `waf` | Web Application Firewall | verified |
| Storage | `cbr` | Cloud Backup and Recovery | verified |
| Storage | `des` | Data Express Service | wave 2 |
| Storage | `dss` | Dedicated Distributed Storage Service | wave 2 |
| Storage | `evs` | Elastic Volume Service | verified |
| Storage | `obs` | Object Storage Service | verified |
| Storage | `sdrs` | Business Recovery Service | wave 2 |
| Storage | `sfs` | Scalable File Service | wave 2 |
| Storage | `sfsturbo` | Scalable File Service Turbo | verified |
| Support | `supportplans` | Support Plans | not counted: a support contract, not a resource |
