# `nosql` — GeminiDB DynamoDB

| Property | Value |
| :--- | :--- |
| **Service Code** | `nosql` (aliases: `geminidb`) |
| **Category** | Databases & Cache |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `nosql_nosql.vm` |
| **Schema Coverage** | 15 controls (4 mapped, 11 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-nosql
  customer: Example Corp
  title_prefix: "Example NOSQL"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: sensor-timeseries-nosql
    environment: carajas_hub
    service: nosql
    billing: ondemand
    needs:
      vcpus: 4
      memory: 16 GiB
    options:
      engine: InfluxDB
      nodes: 2
      storage_gb: 400 GB
```

### Plain Card (`cards:`)

```yaml
customer: Example Corp
name: "Example NOSQL"
settlement: total
cards:
  - id: document-kv
    service: nosql
    region: sa-brazil-1
    billing: monthly
    options:
      flavor: large.4
      nodes: 2
      storage_gb: 100
      engine: dynamodb
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: nosql`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `nosql_nosql.vm`. |
| `options.engine` | `string` | Catalog / Enum | NoSQL API engine (`dynamodb`). *(Portal controls: `calculator_nosql_versionType_group_versionType`)* |
| `options.flavor` | `any` | Builder-validated | GeminiDB node size (`large.4`, `xlarge.4`, `2xlarge.4`, `4xlarge.4`, `8xlarge.4`). Can also be synthesized from `needs: { vcpus }`. |
| `options.nodes` | `any` | Builder-validated | Cluster node count (2–200). Alias: `replicas`. |
| `options.storage_gb` | `any` | Builder-validated | Storage space in GB (≥ 100 GB). |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).

---

## Portal Control Schema (`autocalc://schema/nosql`)

Source file: `src/schema/files/nosql.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_nosql_versionType_group_versionType` | Compatible API | `base-radio-group` | Catalog / Enum | Mapped → `engine` |
| `calculator_nosql_versionType_group_deploymentModal` | Storage Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (fixed to cloud-native storage deployment by the builder) |
| `calculator_nosql_redis_modal_productModal` | Product Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (Redis-compatible GeminiDB control not used by DynamoDB builder) |
| `calculator_nosql_redis_type_type` | DB Instance Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (Redis-compatible GeminiDB control not used by DynamoDB builder) |
| `calculator_nosql_redis_version_radio_version` | Compatible Version | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (Redis-compatible GeminiDB control not used by DynamoDB builder) |
| `calculator_nosql_redis_radio_cpuType` | CPU Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (Redis-compatible GeminiDB control not used by DynamoDB builder) |
| `calculator_nosql_redis_switch_UNSET_Switch` | Instance Creation Method | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (Redis-compatible GeminiDB control not used by DynamoDB builder) |
| `calculator_nosql_redis_public_publicType` | Node Specifications | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (Redis-compatible GeminiDB control not used by DynamoDB builder) |
| `calculator_nosql_redis_vm_select_spec` | — | `base-select` | Catalog / Enum | Fixed / Unsupported (Redis-compatible GeminiDB control not used by DynamoDB builder) |
| `calculator_nosql_redis_colony_node_stepper_Stepper_0` | Nodes | `base-stepper` | `3..12  ` (step 1) | Fixed / Unsupported (Redis-compatible GeminiDB control not used by DynamoDB builder) |
| `calculator_nosql_redis_rs_stepper_Stepper_0` | Total Storage Space | `base-stepper` | `10..480 GB` (step 1) | Fixed / Unsupported (Redis-compatible GeminiDB control not used by DynamoDB builder) |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

## Live Compatibility Replay

Source: `docs/compat/nosql.md` (nosql compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-large-3nodes` | `ok` | `ok` | — |
| `monthly-xlarge-3nodes` | `ok` | `ok` | — |
| `yearly-large-4nodes` | `ok` | `ok` | — |
