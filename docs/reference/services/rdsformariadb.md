# `rdsformariadb` — RDS for MariaDB

| Property | Value |
| :--- | :--- |
| **Service Code** | `rdsformariadb` (aliases: `mariadb`) |
| **Category** | Databases & Cache |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `rdsformariadb_rdsformariadb.vm` |
| **Schema Coverage** | 12 controls (9 mapped, 3 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-rdsformariadb
  customer: Example Corp
  title_prefix: "Example RDSFORMARIADB"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: legacy-billing-mariadb
    environment: prod
    service: rdsformariadb
    billing: monthly
    needs:
      vcpus: 4
      memory: 16 GiB
    options:
      type: primary-standby
      storage_type: ultra-high-io
      storage_gb: 400 GB
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: rdsformariadb`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `rdsformariadb_rdsformariadb.vm`. |
| `options.db_version` | `string` | Catalog / Enum | **DB Engine Version**. Maps to portal control `calculator_rdsvm_radio_dbVersion`. |
| `options.instance_type` | `string` | Catalog / Enum | **DB Instance Type**. Maps to portal control `calculator_rdsvm_radio_instanceType`. |
| `options.public_type` | `string` | Catalog / Enum | **DB Instance Class**. Maps to portal control `calculator_rdsvm_radio_publicType`. |
| `options.spec` | `string` | Catalog / Enum | Maps to portal control `calculator_rdsvm_radio2_spec`. |
| `options.storage_gb` | `number / unit` | `40..4000` (step 10) | Maps to portal control `calculator_rdsvolume_stepper_Stepper_0`. |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `instance_type` (from SKU `instanceType`), `db_version` (from SKU `dbVersion`), `public_type` (from SKU `publicType`), `spec` (from SKU `spec`).

---

## Portal Control Schema (`autocalc://schema/rdsformariadb`)

Source file: `src/schema/files/rdsformariadb.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_rdsvm_radio_dbType` | DB Engine | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_rdsvm_radio_dbVersion` | DB Engine Version | `base-radio-group` | Catalog / Enum | Mapped → `db_version` |
| `calculator_rdsvm_radio_instanceType` | DB Instance Type | `base-radio-group` | Catalog / Enum | Mapped → `instance_type` |
| `calculator_rdsvm_radio_publicType` | DB Instance Class | `base-radio-group` | Catalog / Enum | Mapped → `public_type` |
| `calculator_rdsvm_radio2_spec` | — | `base-select` | Catalog / Enum | Mapped → `spec` |
| `calculator_rdsvolume_stepper_type` | Storage | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_rdsvolume_stepper_Stepper_0` | — | `base-stepper` | `40..4000` (step 10) | Mapped → `storage_gb` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..50 PCS` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/rdsformariadb.md` (rdsformariadb compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-ha` | `ok` | `ok` | — |
| `monthly-ha` | `ok` | `ok` | — |
| `yearly-ha` | `ok` | `ok` | — |
