# Proposal

## Why

The operator needs usable CCE, IaaS, Kafka and RabbitMQ quotations in São Paulo and Santiago. Existing service counts and schema percentages hide missing product variants, and passing anonymous replays do not establish price or publication compatibility.

## What Changes

- Prioritize complete regional CCE Standard/Turbo quotation paths, then infrastructure dependencies and Kafka/RabbitMQ configurations offered by the international calculator.
- Cover São Paulo (`sa-brazil-1`) and Santiago (`la-south-2`) independently, with explicit service/product/mode availability and no substitutions between regions.
- Extend EIP bandwidth/shared-bandwidth and dedicated ELB/LCU support; audit existing ECS Linux, EVS, OBS, public NAT, SFS/SFS Turbo, CBR, Direct Connect, ER, VPC Endpoint, VPN, DSS, SDRS and DES paths for remaining regional gaps.
- Replace incomplete DMS specification conversion tables with values recovered from the matching vendor configuration; expose supported storage choices and enforce broker constraints.
- Add a regional coverage inventory that distinguishes implemented, replay-tested, price-verified, authenticated-publication-verified, unavailable, excluded, portal-defect and blocked-by-environment cases.
- Repair the network-dependent offline business-scenario tests and make compatibility runs preserve evidence by region, report failures through exit status, and avoid mislabeled default regions.
- Out of scope: Windows guest OS quotations, private NAT, RocketMQ, AWS, other regional/site certification, and enabling currently blocked services (`aad`, `cc`, `dbss`, `dsc`, `edgesec`, `esw`, `ga`, `hecs`, `reliability`, `ssa`, `ucs`). Windows host compatibility remains required. No unrelated new service families or provisioning.

## Capabilities

### New Capabilities

- `huawei/regional-coverage`: Auditable regional configuration coverage with separate verification levels and explicit exclusions.

### Modified Capabilities

- `huawei/card-encoding`: Regional CCE variants, infrastructure product variants and catalog/config-driven DMS encoding.

## Impact

Service schemas/builders/forms, catalog-to-option mapping, discovery, CLI/MCP descriptions, compatibility harness and reports, synthetic fixtures and live tests. Existing valid input remains compatible; newly supported variants use explicit options. No publish-gate checks are weakened, bypassed or newly skipped. Existing declared vendor-defect handling remains explicit and cannot qualify as full Edit verification. Runtime values and tokens must come from the selected region/vendor configuration; no committed third-party bundles, credentials or customer quotes.
