# `edgesec` — Edge Security

| Property | Value |
| :--- | :--- |
| **Service Code** | `edgesec` |
| **Category** | Security & Compliance |
| **Publish Gate Status** | `DEFAULT_ONLY` (Catalog & Replay Only) — *Only page defaults have been accepted; requested configuration is unverified.* |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 11 controls (2 mapped, 9 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-edgesec
  customer: Example Corp
  title_prefix: "Example EDGESEC"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: edgesec-main
    service: edgesec
    billing: monthly
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: edgesec`, `region`, `billing` (`monthly`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

*This service uses default calculator form settings and does not expose custom `options`.*

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).
- **Global / Regionless Form**: This service's calculator page omits the standard region selector (`regionless: true`).

---

## Portal Control Schema (`autocalc://schema/edgesec`)

Source file: `src/schema/files/edgesec.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_edgesec_editionRadio_edition` | Edition | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_edgesec_domainStepper_Stepper_0` | Domain Name Expansion Package | `base-stepper` | `0..148` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_edgesec_ruleStepper_Stepper_0` | Rule Expansion Package | `base-stepper` | `0..1000` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_edgesec_areaRadio_areaType` | Region | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_edgesec_areaRadio_chargingModel` | Billing Option | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_edgesec_areaRadio_Stepper_0` | Traffic | `base-stepper` | `0..9999999` (step 1)<br>`0..9999999` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_edgesec_requestsStepper_Stepper_0` | Requests | `base-stepper` | `0..9999999 Ten thousand times` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_edgesec_dynamic_requestsStepper_Stepper_0` | Whole Site Acceleration Requests | `base-stepper` | `0..9999999 Ten thousand times` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

## Live Compatibility Replay

Source: `docs/compat/edgesec.md` (edgesec compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `monthly` | `ok` | `ok` | — |
