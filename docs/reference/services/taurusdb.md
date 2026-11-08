# `taurusdb` — TaurusDB

| Property | Value |
| :--- | :--- |
| **Service Code** | `taurusdb` |
| **Category** | Databases & Cache |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `taurus_taurus.vm` |
| **Schema Coverage** | 15 controls (9 mapped, 6 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-taurusdb
  customer: Example Corp
  title_prefix: "Example TAURUSDB"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: merchant-ledger-taurusdb
    environment: prod
    service: taurusdb
    billing: monthly
    needs:
      vcpus: 4
      memory: 16 GiB
    options:
      replicas: 2
      storage_gb: 500 GB
      backup_storage_gb: 500 GB
```

### Plain Card (`cards:`)

```yaml
customer: Example Corp
name: "Example TAURUSDB"
settlement: total
cards:
  - id: distributed-mysql
    service: taurusdb
    region: sa-brazil-1
    billing: monthly
    spec: gaussdb.mysql.large.x86.4
    options:
      enterprise_instance: standard
      nodes: 2
      storage_gb: 100
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: taurusdb`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `taurus_taurus.vm`. |
| `options.enterprise_instance` | `string` | Catalog / Enum | TaurusDB topology: `standard` (Primary/Standby) or `multi-master`. In declarative quotes, write `topology: standard`. *(Portal controls: `calculator_gaussdb_radio_enterpriseInstance`)* |
| `options.public_type` | `string` | Catalog / Enum | Instance specification class (`x86.4`). *(Portal controls: `calculator_gaussdb_publicType_switch_publicGaussdbType`)* |
| `options.spec` | `string` | Catalog / Enum | TaurusDB compute SKU (e.g. `gaussdb.mysql.large.x86.4`). *(Portal controls: `calculator_gaussdb_publicType_switch_spec`)* |
| `options.nodes` | `number / unit` | `2..10` (step 1) | Total cluster node count including primary and read replicas (2–10 nodes). Alias: `replicas` (node count = replicas + 1). *(Portal controls: `calculator_gaussdb_publicType_switch_Stepper_0`)* |
| `options.storage_gb` | `number / unit` | `10..128000` (step 10) | Cluster storage capacity in GB (10–128,000 GB, in 10 GB increments). *(Portal controls: `calculator_gaussdb_volume_stepper_Stepper_0`)* |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `enterprise_instance` (from SKU `enterpriseInstance`), `public_type` (from SKU `publicGaussdbType`), `spec` (from SKU `spec`).

---

## Portal Control Schema (`autocalc://schema/taurusdb`)

Source file: `src/schema/files/taurusdb.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_engine_switcher_dbType` | DB Engine | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_gaussdb_radio_enterpriseInstance` | DB Instance Type | `base-radio-group` | Catalog / Enum | Mapped → `enterprise_instance` |
| `calculator_gaussdb_radio_dbVersionType` | DB Engine Version | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_gaussdb_radio_azMode` | AZ Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_gaussdb_publicType_switch_publicType` | CPU Architecture | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_gaussdb_publicType_switch_publicGaussdbType` | Instance Specifications | `base-radio-group` | Catalog / Enum | Mapped → `public_type` |
| `calculator_gaussdb_publicType_switch_spec` |   | `base-select` | Catalog / Enum | Mapped → `spec` |
| `calculator_gaussdb_publicType_switch_Stepper_0` | Nodes | `base-stepper` | `2..10` (step 1) | Mapped → `nodes` |
| `calculator_gaussdb_volume_stepper_type` | Storage Space | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_gaussdb_volume_stepper_Stepper_0` | — | `base-stepper` | `10..128000` (step 10) | Mapped → `storage_gb` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..50 PCS` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/taurusdb.md` (taurusdb compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-2u8g` | `ok` | `ok` | — |
| `monthly-8u32g` | `ok` | `ok` | — |
| `yearly-4u16g` | `ok` | `ok` | — |
