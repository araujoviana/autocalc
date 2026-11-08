# `hecs` — Flexus X Instance

| Property | Value |
| :--- | :--- |
| **Service Code** | `hecs` |
| **Category** | Compute |
| **Publish Gate Status** | `DEFAULT_ONLY` (Catalog & Replay Only) — *Only page defaults have been accepted; requested configuration is unverified.* |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 18 controls (4 mapped, 14 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-hecs
  customer: Example Corp
  title_prefix: "Example HECS"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: hecs-main
    service: hecs
    billing: monthly
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: hecs`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

*This service uses default calculator form settings and does not expose custom `options`.*

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.

---

## Portal Control Schema (`autocalc://schema/hecs`)

Source file: `src/schema/files/hecs.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_hecs_radio_arch` | Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_hecs_radio_vmType` | — | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_hecs_radio_cpu` | — | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_hecs_radio_mem` | — | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_ims_select___platform` | Image | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_ims_select_name` | — | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_evs_stepper_main_type` | System Disk | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_evs_stepper_main_Stepper_0` | — | `base-stepper` | `40..1024` (step 20) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_eip_switch_UNSET_Switch` | EIP | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_eip_radio_eipSpec` | EIP Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_eip_radio_shareType` | Bandwidth Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_eip_radio_eipType` | Billed By | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_eip_radio_Stepper_1` | Bandwidth | `base-stepper` | `5..2000` (step 1) when `^19_share`<br>`1..2000` (step 1) when `^19_s?bgp`<br>`1..9999` (step 1) when `^12_` | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..100 HECS` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/hecs.md` (hecs compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `monthly` | `ok` | `ok` | — |
| `yearly` | `ok` | `ok` | — |
| `ondemand` | `ok` | `ok` | — |
