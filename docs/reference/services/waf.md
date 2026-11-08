# `waf` — Web Application Firewall

| Property | Value |
| :--- | :--- |
| **Service Code** | `waf` |
| **Category** | Security & Compliance |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 9 controls (3 mapped, 6 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-waf
  customer: Example Corp
  title_prefix: "Example WAF"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: edge-waf-protection
    environment: edge
    service: waf
    billing: monthly
    options:
      edition: Professional
      domain_expansion: 1
      rule_expansion: 1
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: waf`, `region`, `billing` (`ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `options.domains` | `any` | Builder-validated | Domain expansion package count (≥ 1). |
| `options.requests` | `any` | Builder-validated | Monthly request count (≥ 1,000,000). |
| `options.rules` | `any` | Builder-validated | Rule expansion package count (≥ 1). |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.

---

## Portal Control Schema (`autocalc://schema/waf`)

Source file: `src/schema/files/waf.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_waf_wafModeRadio_wafMode` | WAF Mode | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (fixed to cloud WAF mode by the builder) |
| `calculator_waf_editionRadio_edition` | Edition | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (builder prices pay-per-use WAF domains, rules, and requests) |
| `calculator_waf_domainStepper_Stepper_0` | Domain Expansion Package | `base-stepper` | `0..1000 PCS` (step 1) | Fixed / Unsupported (period package stepper not used by pay-per-use WAF builder) |
| `calculator_waf_bandwidthStepper_Stepper_0` | QPS Extension Package | `base-stepper` | `0..1000 PCS` (step 1) | Fixed / Unsupported (period package stepper not used by pay-per-use WAF builder) |
| `calculator_waf_ruleStepper_Stepper_0` | Rule Expansion Package | `base-stepper` | `0..1000 PCS` (step 1) | Fixed / Unsupported (period package stepper not used by pay-per-use WAF builder) |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

## Live Compatibility Replay

Source: `docs/compat/waf.md` (waf compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-default` | `ok` | `ok` | — |
| `ondemand-5m-requests` | `ok` | `ok` | — |
