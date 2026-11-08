# `apm` — Application Performance Management

| Property | Value |
| :--- | :--- |
| **Service Code** | `apm` |
| **Category** | Observability & AI |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | `apm_apm2.instance` |
| **Schema Coverage** | 10 controls (3 mapped, 7 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-apm
  customer: Example Corp
  title_prefix: "Example APM"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: game-telemetry-apm
    environment: latam_south
    service: apm
    billing: ondemand
    options:
      probe_days: 500
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: apm`, `region`, `billing` (`ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` / `options.spec` | `string` | Catalog SKU | Resolved catalog specification code (group `apm_apm2.instance`). Can also be selected via `needs:`. |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.

---

## Portal Control Schema (`autocalc://schema/apm`)

Source file: `src/schema/files/apm.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_apm2Enterprise150_stepper_Stepper_0` | Basic Packages | `base-stepper` | `0..9999` (step 1) | Fixed / Unsupported (builder prices pay-per-use APM 2.0 instances) |
| `calculator_apm2Enterprise1200_stepper_Stepper_0` | Medium Packages | `base-stepper` | `0..9999` (step 1) | Fixed / Unsupported (builder prices pay-per-use APM 2.0 instances) |
| `calculator_apm2Enterprise9600_stepper_Stepper_0` | Advanced Packages | `base-stepper` | `0..9999` (step 1) | Fixed / Unsupported (builder prices pay-per-use APM 2.0 instances) |
| `calculator_apm2Enterprise36500_stepper_Stepper_0` | Golden Packages | `base-stepper` | `0..9999` (step 1) | Fixed / Unsupported (builder prices pay-per-use APM 2.0 instances) |
| `calculator_apm2Enterprise109500_stepper_Stepper_0` | Platinum Packages | `base-stepper` | `0..9999` (step 1) | Fixed / Unsupported (builder prices pay-per-use APM 2.0 instances) |
| `calculator_apm2Enterprise182500_stepper_Stepper_0` | Top Packages | `base-stepper` | `0..9999` (step 1) | Fixed / Unsupported (builder prices pay-per-use APM 2.0 instances) |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

## Live Compatibility Replay

Source: `docs/compat/apm.md` (apm compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-normal` | `ok` | `ok` | — |
| `ondemand-normal-full` | `ok` | `ok` | — |
