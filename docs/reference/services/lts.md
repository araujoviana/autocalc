# `lts` — Log Tank Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `lts` |
| **Category** | Observability & AI |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | `lts_lts.logflow` |
| **Schema Coverage** | 12 controls (11 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-lts
  customer: Example Corp
  title_prefix: "Example LTS"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: playback-telemetry-lts
    environment: origin
    service: lts
    billing: ondemand
    options:
      raw_log_size_gb: 500 GB
      index_traffic_gb: 250 GB
      log_storage_gb: 1000 GB
      retention_days: 30
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: lts`, `region`, `billing` (`ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `lts_lts.logflow`. |
| `options.flow_gb_per_day` | `number / unit` | `1..9999999999 GB/day` (step 1)<br>`1..9999999999 TB/day` (step 1) | **Raw Log Size**. Maps to portal control `calculator_ltsLogFlow_stepper_Stepper_0`. |
| `options.cold_enabled` | `string` | Catalog / Enum | **Intelligent Cold Storage**. Maps to portal control `calculator_lts_cold_switch_UNSET_Switch`. |
| `options.retention_days` | `number / unit` | `1..365` (step 1) | **Log Storage Duration (Days)**. Maps to portal control `calculator_ltsStorage_normal_stepper_Stepper_0`. |
| `options.total_retention_days` | `number / unit` | `1..365` (step 1) | **Log Storage Duration (Days), cold storage on**. Maps to portal control `calculator_ltsStorage_stepper_Stepper_0`. |
| `options.hot_retention_days` | `number / unit` | `1..365` (step 1) | **Hot Storage Duration (Days)**. Maps to portal control `calculator_ltsHotStorage_stepper_Stepper_0`. |
| `options.index_percent` | `number / unit` | `1..100 %` (step 1) | **Index Field Ratio**. Maps to portal control `calculator_ltsLogIndexRate_stepper_Stepper_0`. |
| `options.transfer_basic_gb_per_day` | `number / unit` | `0..9999999999 GB/day` (step 1)<br>`0..9999999999 TB/day` (step 1) | **Daily Basic Transfer Volume**. Maps to portal control `calculator_lts_transfer_basic_stepper_Stepper_0`. |
| `options.transfer_senior_gb_per_day` | `number / unit` | `0..9999999999 GB/day` (step 1)<br>`0..9999999999 TB/day` (step 1) | **Daily Advanced Transfer Volume**. Maps to portal control `calculator_lts_transfer_senior_stepper_Stepper_0`. |
| `options.months` | `number / unit` | `1..60 month` (step 1)<br>`1..30 day` (step 1) | **Required Duration**. Maps to portal control `global_ONDEMANDTIME_Stepper_0`. |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).

---

## Portal Control Schema (`autocalc://schema/lts`)

Source file: `src/schema/files/lts.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_ltsLogFlow_stepper_Stepper_0` | Raw Log Size | `base-stepper` | `1..9999999999 GB/day` (step 1)<br>`1..9999999999 TB/day` (step 1) | Mapped → `flow_gb_per_day` |
| `calculator_lts_cold_switch_UNSET_Switch` | Intelligent Cold Storage | `base-radio-group` | Catalog / Enum | Mapped → `cold_enabled` |
| `calculator_ltsStorage_normal_stepper_Stepper_0` | Log Storage Duration (Days) | `base-stepper` | `1..365` (step 1) | Mapped → `retention_days` |
| `calculator_ltsStorage_stepper_Stepper_0` | Log Storage Duration (Days), cold storage on | `base-stepper` | `1..365` (step 1) | Mapped → `total_retention_days` |
| `calculator_ltsHotStorage_stepper_Stepper_0` | Hot Storage Duration (Days) | `base-stepper` | `1..365` (step 1) | Mapped → `hot_retention_days` |
| `calculator_ltsLogIndexRate_stepper_Stepper_0` | Index Field Ratio | `base-stepper` | `1..100 %` (step 1) | Mapped → `index_percent` |
| `calculator_lts_transfer_basic_stepper_Stepper_0` | Daily Basic Transfer Volume | `base-stepper` | `0..9999999999 GB/day` (step 1)<br>`0..9999999999 TB/day` (step 1) | Mapped → `transfer_basic_gb_per_day` |
| `calculator_lts_transfer_senior_stepper_Stepper_0` | Daily Advanced Transfer Volume | `base-stepper` | `0..9999999999 GB/day` (step 1)<br>`0..9999999999 TB/day` (step 1) | Mapped → `transfer_senior_gb_per_day` |
| `global_ONDEMANDTIME_Stepper_0` | Required Duration | `base-stepper` | `1..60 month` (step 1)<br>`1..30 day` (step 1) | Mapped → `months` |

---

## Live Compatibility Replay

Source: `docs/compat/lts.md` (lts compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-cold-storage` | `ok` | `ok` | — |
