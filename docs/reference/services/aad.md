# `aad` — Anti-DDoS Advanced

| Property | Value |
| :--- | :--- |
| **Service Code** | `aad` |
| **Category** | Security & Compliance |
| **Publish Gate Status** | `DEFAULT_ONLY` (Catalog & Replay Only) — *Only page defaults have been accepted; requested configuration is unverified.* |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 11 controls (3 mapped, 8 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-aad
  customer: Example Corp
  title_prefix: "Example AAD"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: aad-main
    service: aad
    billing: monthly
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: aad`, `region`, `billing` (`monthly` | `yearly`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

*This service uses default calculator form settings and does not expose custom `options`.*

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **Global / Regionless Form**: This service's calculator page omits the standard region selector (`regionless: true`).

---

## Portal Control Schema (`autocalc://schema/aad`)

Source file: `src/schema/files/aad.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_cad_resourceType_UNSET_Switch` | Instance Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_native_areaResource_UNSET_Switch` | Region | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_native_areaSpecification_servicePack` | Protection Level | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_cnad_sourceBtnRadio_UNSET_Switch` | Resource Location | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_native_serviceBW_servicebandwidth` | Service Bandwidth | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_cad_elastic_bandwidth_switch_Stepper_0` | Elastic Bandwidth | `base-radio-stepper` | `1..3 Mbit/s` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_native_protectedip_Stepper_0` | Protected IP Addresses | `base-stepper` | `50..1000 Number` (step 5) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..99 PCS` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/aad.md` (aad compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `monthly` | `ok` | `ok` | — |
| `yearly` | `ok` | `ok` | — |
