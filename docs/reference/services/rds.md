# `rds` — Relational Database Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `rds` |
| **Category** | Databases & Cache |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand`, `monthly`, `yearly` |
| **Primary Catalog Group** | `rds_rds.vm` |
| **Schema Coverage** | 13 controls (11 mapped, 2 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-rds
  customer: Example Corp
  title_prefix: "Example RDS"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: order-primary-rds
    environment: prod
    service: rds
    billing: yearly
    needs:
      engine: mysql
      vcpus: 8
      memory: 32 GiB
    options:
      version: "8.0"
      type: primary-standby
      storage_type: cloud-ssd
      storage_gb: 500 GB
```

### Plain Card (`cards:`)

```yaml
customer: Example Corp
name: "Example RDS"
settlement: total
cards:
  - id: primary-db
    service: rds
    region: sa-brazil-1
    billing: monthly
    spec: rds.mysql.n1.large.2.ha
    options:
      storage_gb: 200
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: rds`, `region`, `billing` (`ondemand` | `monthly` | `yearly`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` / `options.flavor` | `string` | Catalog SKU | Resolved catalog specification code (group `rds_rds.vm`). Can also be selected via `needs:`. |
| `options.flavor` | `string` | Catalog / Enum | Database compute specification (group `rds_rds.vm`). Can also be synthesized from `needs: { vcpus, memory_gb }` and `topology: primary-standby`. *(Portal controls: `calculator_rdsvm_radio_dbType`, `calculator_rdsvm_radio_dbVersion`, `calculator_rdsvm_radio_instanceType`, `calculator_rdsvm_radio_publicType`, `calculator_rdsvm_radio2_spec`)* |
| `options.volume_type` | `string` | Catalog / Enum | Storage media type selector (`cloud-ssd`, `common`). *(Portal controls: `calculator_rdsvolume_stepper_type`)* |
| `options.storage_gb` | `number / unit` | `40..32000` (step 10) | Database volume size in GB (40–4000 GB). In declarative `version: "1"`, write `storage_gb: "500 GB"`. *(Portal controls: `calculator_rdsvolume_stepper_Stepper_0`)* |
| `options.db_version` | `any` | Builder-validated | Database engine release version (e.g. `8.0`, `5.7`, `14`). Alias: `version`. |
| `options.storage_spec` | `any` | Builder-validated | Volume SKU override; defaults to the selected engine's Cloud SSD volume. |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.

---

## Portal Control Schema (`autocalc://schema/rds`)

Source file: `src/schema/files/rds.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_rdsvm_radio_dbType` | DB Engine | `base-radio-group` | Catalog / Enum | Mapped → `flavor` |
| `calculator_rdsvm_radio_dbVersion` | DB Engine Version | `base-radio-group` | Catalog / Enum | Mapped → `flavor` |
| `calculator_rdsvm_radio_instanceType` | DB Instance Type | `base-radio-group` | Catalog / Enum | Mapped → `flavor` |
| `calculator_rdsvm_radio_azMode` | Sub-AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (sub-AZ mode is left at the page default) |
| `calculator_rdsvm_radio_publicType` | DB Instance Class | `base-radio-group` | Catalog / Enum | Mapped → `flavor` |
| `calculator_rdsvm_radio2_spec` | — | `base-select` | Catalog / Enum | Mapped → `flavor` |
| `calculator_rdsvolume_stepper_type` | Storage | `base-select` | Catalog / Enum | Mapped → `volume_type` |
| `calculator_rdsvolume_stepper_Stepper_0` | — | `base-stepper` | `40..32000` (step 10) | Mapped → `storage_gb` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..50 PCS` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/rds.md` (rds compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-mysql-ha` | `ok` | `ok` | — |
| `monthly-mysql-single` | `ok` | `ok` | — |
| `yearly-pg-ha` | `ok` | `ok` | — |
