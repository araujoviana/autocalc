# `reliability` — Reliability (Distributed Message Service)

| Property | Value |
| :--- | :--- |
| **Service Code** | `reliability` |
| **Category** | Middleware & Messaging |
| **Publish Gate Status** | `DEFAULT_ONLY` (Catalog & Replay Only) — *Only page defaults have been accepted; requested configuration is unverified.* |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 11 controls (4 mapped, 7 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-reliability
  customer: Example Corp
  title_prefix: "Example RELIABILITY"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: reliability-main
    service: reliability
    billing: monthly
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: reliability`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

*This service uses default calculator form settings and does not expose custom `options`.*

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.

---

## Portal Control Schema (`autocalc://schema/reliability`)

Source file: `src/schema/files/reliability.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_reliability_version_switch_versionType` | Version | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_reliability_instance_type_switch_instanceVersionType` | Instance Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_reliability_architecture_switch_instanceTypeName` | Architecture | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_reliability_specType_switch_specName` | Flavor | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_reliability_new_storage_stepper_storageType` | Storage Space | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_reliability_new_storage_stepper_Stepper_0` | — | `base-stepper` | `100..30000` (step 100) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..999 instance` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/reliability.md` (reliability compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand` | `ok` | `ok` | — |
| `monthly` | `ok` | `ok` | — |
| `yearly` | `ok` | `ok` | — |
