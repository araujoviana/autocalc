# `cc` — Cloud Connect

| Property | Value |
| :--- | :--- |
| **Service Code** | `cc` |
| **Category** | Networking & Edge |
| **Publish Gate Status** | `DEFAULT_ONLY` (Catalog & Replay Only) — *Only page defaults have been accepted; requested configuration is unverified.* |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 9 controls (3 mapped, 6 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-cc
  customer: Example Corp
  title_prefix: "Example CC"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: cc-main
    service: cc
    billing: monthly
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: cc`, `region`, `billing` (`monthly` | `yearly`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

*This service uses default calculator form settings and does not expose custom `options`.*

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **Global / Regionless Form**: This service's calculator page omits the standard region selector (`regionless: true`).

---

## Portal Control Schema (`autocalc://schema/cc`)

Source file: `src/schema/files/cc.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_cc_resourceType_resourceName` | Billed Resource | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_cc_radio_chargingModel` | Billed By | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_cc_radio_interType` | Bandwidth Package Applicability | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_cc_radio_interZone` | Geographic Region | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_cc_radio_Stepper_0` | Bandwidth | `base-stepper` | `2..100000 calc_17_` (step 1) when `bandwidth.` | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..10000 bandwidth package` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/cc.md` (cc compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `monthly` | `ok` | `ok` | — |
| `yearly` | `ok` | `ok` | — |
