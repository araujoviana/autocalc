# `dew` — Data Encryption Workshop

| Property | Value |
| :--- | :--- |
| **Service Code** | `dew` (aliases: `kms`) |
| **Category** | Security & Compliance |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 7 controls (3 mapped, 4 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-dew
  customer: Example Corp
  title_prefix: "Example DEW"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: payment-signing-hsm
    environment: prod
    service: dew
    billing: ondemand
    options:
      custom_keys: 10
      hsm_edition: standard
      hsm_instances: 1
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: dew`, `region`, `billing` (`ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `options.api_requests` | `any` | Builder-validated | API request units (1–9,999 per physical card, in units of 10,000 requests; automatically split across cards in `version: "1"`). |
| `options.api_spec` | `any` | Builder-validated | API call SKU (`kms.api` or `csms.secret.api`). |
| `options.days` | `any` | Builder-validated | On-demand duration in days (default: `30`). |
| `options.keys` | `any` | Builder-validated | Number of KMS custom keys or CSMS secrets (1–99 per physical card; automatically split across cards in `version: "1"`). |
| `options.storage_spec` | `any` | Builder-validated | Key/secret storage SKU (`kms.ud.customer` or `csms.secret.storage`). |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.

---

## Portal Control Schema (`autocalc://schema/dew`)

Source file: `src/schema/files/dew.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_hsmType_radio_hsmName` | Service Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (builder prices KMS and CSMS on-demand usage) |
| `calculator_hsmType_radio_hsmType` | Edition | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (builder prices KMS and CSMS on-demand usage) |
| `calculator_hsmType_radio_Stepper_0` | Quantity | `base-stepper` | `2..99 detail_118_` (step 1) | Fixed / Unsupported (builder prices KMS and CSMS on-demand usage) |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

## Live Compatibility Replay

Source: `docs/compat/dew.md` (dew compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-kms` | `ok` | `ok` | — |
| `ondemand-csms` | `ok` | `ok` | — |
