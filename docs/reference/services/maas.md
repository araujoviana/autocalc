# `maas` — Model as a Service (ModelArts Studio)

| Property | Value |
| :--- | :--- |
| **Service Code** | `maas` |
| **Category** | Observability & AI |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | `modelarts_modelarts.tokens` |
| **Schema Coverage** | 11 controls (10 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-maas
  customer: Example Corp
  title_prefix: "Example MAAS"
defaults:
  region: ap-southeast-1
  billing: ondemand
resources:
  - id: maas-deepseek-tokens
    environment: ai_prod
    service: maas
    billing: ondemand
    options:
      model: deepseek-v3-671b
      tokens_thousands: 50000
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: maas`, `region`, `billing` (`ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `modelarts_modelarts.tokens`. |
| `options.reasoning_mode` | `string` | Catalog / Enum | **Inference Mode**. Maps to portal control `calculator_ucsType_radio_ondemand_reasoningMode`. |
| `options.model_service_type` | `string` | Catalog / Enum | **Model Type**. Maps to portal control `calculator_ucsType_radio_ondemand_modelServiceType`. |
| `options.model_series` | `string` | Catalog / Enum | **Models**. Maps to portal control `calculator_ucsType_radio_ondemand_modelSeries`. |
| `options.model_name` | `string` | Catalog / Enum | **Model**. Maps to portal control `calculator_ucsType_radio_ondemand_modelName`. |
| `options.billing_mode_type` | `string` | Catalog / Enum | **Billing Mode**. Maps to portal control `calculator_ucsType_radio_ondemand_billingModeType`. |
| `options.input_mtokens` | `number / unit` | `1..999999999 million tokens` (step 1) | **Input**. Maps to portal control `calculator_Input_stepper_Stepper_0`. |
| `options.output_mtokens` | `number / unit` | `1..999999999 million tokens` (step 1) | **Output**. Maps to portal control `calculator_output_stepper_Stepper_0`. |
| `options.cached_input_mtokens` | `number / unit` | `1..999999999 million tokens` (step 1) | **Cache Hit Input**. Maps to portal control `calculator_token_cached_input_stepper_Stepper_0`. |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).
- **Usage-Priced (`USAGE_PRICED`)**: Pay-per-use SKUs carry usage plans rather than a flat catalog list price; `plan-quote` resolves the SKU, and exact usage rating runs during `apply-quote` / `quote`.
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `model_series` (from SKU `modelSeries`), `model_name` (from SKU `modelName`), `model_service_type` (from SKU `modelServiceType`), `reasoning_mode` (from SKU `reasoningMode`), `billing_mode_type` (from SKU `billingModeType`).

---

## Portal Control Schema (`autocalc://schema/maas`)

Source file: `src/schema/files/maas.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_ucsType_radio_ondemand_reasoningMode` | Inference Mode | `base-radio-group` | Catalog / Enum | Mapped → `reasoning_mode` |
| `calculator_ucsType_radio_ondemand_modelServiceType` | Model Type | `base-radio-group` | Catalog / Enum | Mapped → `model_service_type` |
| `calculator_ucsType_radio_ondemand_modelSeries` | Models | `base-radio-group` | Catalog / Enum | Mapped → `model_series` |
| `calculator_ucsType_radio_ondemand_modelName` | Model | `base-radio-group` | Catalog / Enum | Mapped → `model_name` |
| `calculator_ucsType_radio_ondemand_billingModeType` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing_mode_type` |
| `calculator_Input_stepper_Stepper_0` | Input | `base-stepper` | `1..999999999 million tokens` (step 1) | Mapped → `input_mtokens` |
| `calculator_output_stepper_Stepper_0` | Output | `base-stepper` | `1..999999999 million tokens` (step 1) | Mapped → `output_mtokens` |
| `calculator_token_cached_input_stepper_Stepper_0` | Cache Hit Input | `base-stepper` | `1..999999999 million tokens` (step 1) | Mapped → `cached_input_mtokens` |

---

## Live Compatibility Replay

Source: `docs/compat/maas.md` (maas compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-deepseek-flash` | `ok` | `ok` | — |
