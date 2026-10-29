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

The former count of 50 included default-only page acceptance and incomplete prices. It did not
establish request fidelity and is withdrawn. The v1 target is **not yet demonstrated**.
Publication requires an eligible builder, supported billing, representable quantity/options,
a mapped chosen specification, and matching requested/page/global values before price checks.

The table below separates eligible builders from blocked paths. Eligibility does not guarantee
that every regional spec or option combination can publish. Recipes without a chosen-spec
mapping reject decided catalog specs. LTS, FunctionGraph and default-only recipes are blocked;
CCE turbo is blocked while standard clusters remain eligible.

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
| Compute | `ecs` | Elastic Cloud Server | eligible |
| Compute | `function` | FunctionGraph | blocked pending verification |
| Compute | `hcss` | Flexus L Instance | later |
| Compute | `hecs` | Flexus X Instance | blocked pending verification |
| Containers | `cce` | Cloud Container Engine | eligible |
| Containers | `cci` | Cloud Container Instance | eligible |
| Containers | `ucs` | Ubiquitous Cloud Native Service | blocked pending verification |
| Content Delivery & Edge Computing | `cdn` | Content Delivery Network | later |
| Content Delivery & Edge Computing | `wsa` | Whole Site Acceleration | later |
| Databases | `ddm` | Distributed Database Middleware | eligible (spec mapping required) |
| Databases | `dds` | Document Database Service | eligible (spec mapping required) |
| Databases | `drs` | Data Replication Service | eligible (spec mapping required) |
| Databases | `gaussdb` | GaussDB | eligible (spec mapping required) |
| Databases | `hrds` | Dedicated RDS | eligible (spec mapping required) |
| Databases | `memcached` | DCS (for Memcached) | eligible (spec mapping required) |
| Databases | `nosql` | GeminiDB | eligible |
| Databases | `rds` | Relational Database Service | eligible |
| Databases | `rdsformariadb` | RDS for MariaDB | eligible (spec mapping required) |
| Databases | `redis` | DCS (for Redis) | eligible (spec mapping required) |
| Databases | `taurusdb` | TaurusDB | eligible (spec mapping required) |
| Developer Services | `astrozero` | Huawei Cloud Astro Zero | later |
| Developer Services | `devcloud` | CodeArts | later |
| Developer Services | `servicestage` | ServiceStage | later |
| IoT | `gsl` | Global SIM Link | not counted: one-time SIM purchase, not a recurring quote |
| IoT | `iotda` | IoT Device Access | later |
| MacroVerse aPaaS | `koomessage` | KooMessage | later |
| Management & Governance | `aom` | Application Operations Management | later |
| Management & Governance | `apm` | Application Performance Management | eligible |
| Management & Governance | `lts` | Log Tank Service | blocked pending verification |
| Media Services | `cloudrtc` | Huawei Cloud Real-Time Communication | later |
| Media Services | `live` | Live | later |
| Media Services | `mpc` | Media Processing Center | later |
| Media Services | `vod` | Video on Demand | later |
| Middleware | `apig` | API Gateway | eligible |
| Middleware | `cse` | Cloud Service Engine | later |
| Middleware | `eg` | EventGrid | later |
| Middleware | `kafka` | DMS (for Kafka) | eligible |
| Middleware | `mas` | Multi-Site High Availability Service | later |
| Middleware | `rabbitMQ` | DMS (for RabbitMQ) | eligible |
| Middleware | `reliability` | Reliability (Distributed Message Service) | blocked pending verification |
| Migration | `cdm` | Cloud Data Migration | later |
| Networking | `cc` | Cloud Connect | blocked pending verification |
| Networking | `dline` | Direct Connect As A Service | eligible |
| Networking | `eip` | Elastic IP | blocked pending verification |
| Networking | `elb` | Elastic Load Balance | eligible |
| Networking | `er` | Enterprise Router | eligible (spec mapping required) |
| Networking | `esw` | Enterprise Switch | blocked pending verification |
| Networking | `ga` | Global Accelerator | blocked pending verification |
| Networking | `nat` | NAT Gateway | eligible |
| Networking | `vpcep` | VPC Endpoint | blocked pending verification |
| Networking | `vpn` | Virtual Private Network | blocked pending verification |
| Professional Services | `hcoms` | HUAWEI CLOUD O&M Service | not counted: a professional service, not a resource |
| Security & Compliance | `aad` | Anti-DDoS Service | blocked pending verification |
| Security & Compliance | `cbh` | Cloud Bastion Host | later |
| Security & Compliance | `ccm` | Cloud Certificate & Manager | later |
| Security & Compliance | `cfw` | Cloud Firewall | blocked pending verification |
| Security & Compliance | `dbss` | Database Security Service | blocked pending verification |
| Security & Compliance | `dew` | Data Encryption Workshop | eligible |
| Security & Compliance | `dsc` | Data Security Center | blocked pending verification |
| Security & Compliance | `edgesec` | Edge Security | blocked pending verification |
| Security & Compliance | `hss` | Host Security Service | blocked pending verification |
| Security & Compliance | `ssa` | Situation Awareness | eligible (spec mapping required) |
| Security & Compliance | `waf` | Web Application Firewall | eligible |
| Storage | `cbr` | Cloud Backup and Recovery | eligible |
| Storage | `des` | Data Express Service | eligible (spec mapping required) |
| Storage | `dss` | Dedicated Distributed Storage Service | eligible (spec mapping required) |
| Storage | `evs` | Elastic Volume Service | eligible |
| Storage | `obs` | Object Storage Service | eligible |
| Storage | `sdrs` | Business Recovery Service | eligible (spec mapping required) |
| Storage | `sfs` | Scalable File Service | eligible (spec mapping required) |
| Storage | `sfsturbo` | Scalable File Service Turbo | eligible |
| Support | `supportplans` | Support Plans | not counted: a support contract, not a resource |
