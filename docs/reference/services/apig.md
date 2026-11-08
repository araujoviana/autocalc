# `apig` — API Gateway

| Property | Value |
| :--- | :--- |
| **Service Code** | `apig` |
| **Category** | Middleware & Messaging |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | `apig_apig.instance` |
| **Schema Coverage** | 7 controls (4 mapped, 3 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-apig
  customer: Example Corp
  title_prefix: "Example APIG"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: bacen-api-gateway
    environment: prod
    service: apig
    billing: ondemand
    options:
      edition: Pro
      public_outbound_bandwidth_mbps: 50 Mbps
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: apig`, `region`, `billing` (`ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` / `options.edition` | `string` | Catalog SKU | Resolved catalog specification code (group `apig_apig.instance`). Can also be selected via `needs:`. |
| `options.edition` | `string` | Catalog / Enum | **Edition**. Maps to portal control `calculator_spec_radioGroups_type`. |
| `options.hours` | `number / unit` | `1..9999 hour` (step 1) | **Required Duration**. Maps to portal control `global_ONDEMANDTIME_Stepper_0`. |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.

---

## Portal Control Schema (`autocalc://schema/apig`)

Source file: `src/schema/files/apig.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_spec_radioGroups_type` | Edition | `base-radio-group` | Catalog / Enum | Mapped → `edition` |
| `calculator_bandwidth_switch_UNSET_Switch` | Public Outbound Access | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (fixed to no public outbound bandwidth by the builder) |
| `calculator_bandwidth_stepper_Stepper_0` | Bandwidth | `base-stepper` | `1..2000 Mbit/s` (step 1) | Fixed / Unsupported (outbound bandwidth add-on is not configured by the builder) |
| `global_ONDEMANDTIME_Stepper_0` | Required Duration | `base-stepper` | `1..9999 hour` (step 1) | Mapped → `hours` |

---

## Live Compatibility Replay

Source: `docs/compat/apig.md` (apig compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-basic` | `ok` | `ok` | — |
| `ondemand-basic-full` | `ok` | `ok` | — |
