# `gaussdb` — GaussDB

| Property | Value |
| :--- | :--- |
| **Service Code** | `gaussdb` |
| **Category** | Databases & Cache |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `gaussdb_gaussdb.vm` |
| **Schema Coverage** | 13 controls (11 mapped, 2 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-gaussdb
  customer: Example Corp
  title_prefix: "Example GAUSSDB"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: settlement-gaussdb
    environment: prod
    service: gaussdb
    billing: monthly
    needs:
      vcpus: 8
      memory: 64 GiB
    options:
      edition: distributed
      replicas: 3
      sharding_nodes: 3
      coordinator_nodes: 3
      storage_gb: 400 GB
      backup_storage_gb: 400 GB
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: gaussdb`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `gaussdb_gaussdb.vm`. |
| `options.database_type` | `string` | Catalog / Enum | **DB Engine**. Maps to portal control `calculator_opgauss_radio_databseType`. |
| `options.db_version` | `string` | Catalog / Enum | **DB Engine Version**. Maps to portal control `calculator_opgauss_radio_dbOpenGaussVersion`. |
| `options.instance_type` | `string` | Catalog / Enum | **DB Instance Type**. Maps to portal control `calculator_opgauss_radio_insType`. |
| `options.deploy_model` | `string` | Catalog / Enum | **Deployment Model**. Maps to portal control `calculator_opgauss_radio_deployModel`. |
| `options.public_type` | `string` | Catalog / Enum | **Instance Specifications**. Maps to portal control `calculator_opgauss_spec_radio_publicOpengaussType`. |
| `options.spec` | `string` | Catalog / Enum | ** **. Maps to portal control `calculator_opgauss_spec_radio_spec`. |
| `options.storage_gb` | `number / unit` | `40..24000` (step 4) | **Storage Space**. Maps to portal control `calculator_openGauss_volume_stepper_Stepper_0`. |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `deploy_model` (from SKU `deployModel`), `instance_type` (from SKU `insType`), `db_version` (from SKU `dbOpenGaussVersion`), `database_type` (from SKU `databseType`), `public_type` (from SKU `publicOpengaussType`), `spec` (from SKU `spec`).

---

## Portal Control Schema (`autocalc://schema/gaussdb`)

Source file: `src/schema/files/gaussdb.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_opgauss_radio_databseType` | DB Engine | `base-radio-group` | Catalog / Enum | Mapped → `database_type` |
| `calculator_opgauss_radio_dbOpenGaussVersion` | DB Engine Version | `base-radio-group` | Catalog / Enum | Mapped → `db_version` |
| `calculator_opgauss_radio_insType` | DB Instance Type | `base-radio-group` | Catalog / Enum | Mapped → `instance_type` |
| `calculator_opgauss_radio_deployModel` | Deployment Model | `base-radio-group` | Catalog / Enum | Mapped → `deploy_model` |
| `calculator_opgauss_spec_radio_publicOpengaussType` | Instance Specifications | `base-radio-group` | Catalog / Enum | Mapped → `public_type` |
| `calculator_opgauss_spec_radio_spec` |   | `base-select` | Catalog / Enum | Mapped → `spec` |
| `calculator_openGauss_volume_stepper_type` | Storage Space | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_openGauss_volume_stepper_Stepper_0` | Storage Space | `base-stepper` | `40..24000` (step 4) | Mapped → `storage_gb` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..50 PCS` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/gaussdb.md` (gaussdb compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-ha-4u16g` | `ok` | `ok` | — |
| `monthly-ha-32u128g` | `ok` | `ok` | — |
| `yearly-ha-16u64g` | `ok` | `ok` | — |
