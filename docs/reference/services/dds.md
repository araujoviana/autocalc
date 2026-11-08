# `dds` — Document Database Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `dds` (aliases: `mongodb`) |
| **Category** | Databases & Cache |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `dds_dds.vm` |
| **Schema Coverage** | 16 controls (9 mapped, 7 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-dds
  customer: Example Corp
  title_prefix: "Example DDS"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: player-profile-dds
    environment: latam_south
    service: dds
    billing: monthly
    needs:
      vcpus: 4
      memory: 16 GiB
    options:
      version: "4.4"
      type: replica-set
      storage_gb: 500 GB
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: dds`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `dds_dds.vm`. |
| `options.type` | `string` | Catalog / Enum | **DB Instance Type**. Maps to portal control `calculator_dds_versionType_radio_type`. |
| `options.flavor_type` | `string` | Catalog / Enum | **Specifications**. Maps to portal control `calculator_dds_versionType_radio_flavorType`. |
| `options.shard_spec` | `string` | Catalog / Enum | **shard Class**. Maps to portal control `calculator_dds_colony_shard_spec`. |
| `options.shards` | `number / unit` | `2..32 dataInfo_22_` (step 1) | **shard Quantity**. Maps to portal control `calculator_dds_colony_shard_Stepper_0`. |
| `options.shard_storage_gb` | `number / unit` | `10..5000` (step 10) | Maps to portal control `calculator_dds_colony_shard_volume_Stepper_0`. |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `flavor_type` (from SKU `flavorType`), `shard_spec` (from SKU `spec`).

---

## Portal Control Schema (`autocalc://schema/dds`)

Source file: `src/schema/files/dds.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_dds_versionType_radio_type` | DB Instance Type | `base-radio-group` | Catalog / Enum | Mapped → `type` |
| `calculator_dds_versionType_radio_flavorType` | Specifications | `base-radio-group` | Catalog / Enum | Mapped → `flavor_type` |
| `calculator_dds_colony_mongos_spec` | dds mongos Class | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_dds_colony_mongos_Stepper_0` | dds mongos Quantity | `base-stepper` | `2..32 dataInfo_22_` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_dds_colony_shard_spec` | shard Class | `base-select` | Catalog / Enum | Mapped → `shard_spec` |
| `calculator_dds_colony_shard_Stepper_0` | shard Quantity | `base-stepper` | `2..32 dataInfo_22_` (step 1) | Mapped → `shards` |
| `calculator_dds_colony_shard_volume_ioType` | shard Storage Space | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_dds_colony_shard_volume_Stepper_0` | — | `base-stepper` | `10..5000` (step 10) | Mapped → `shard_storage_gb` |
| `calculator_dds_colony_config_stepper_2_spec` | config Class | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_dds_colony_config_stepper_3_ioType` | config Storage Space | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_dds_colony_config_stepper_3_Stepper_0` | — | `base-stepper` | Default `20` | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..50 PCS` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/dds.md` (dds compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-cluster` | `ok` | `ok` | — |
| `monthly-cluster` | `ok` | `ok` | — |
| `yearly-cluster` | `ok` | `ok` | — |
