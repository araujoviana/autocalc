# `function` — FunctionGraph

| Property | Value |
| :--- | :--- |
| **Service Code** | `function` (aliases: `fg`, `functiongraph`) |
| **Category** | Compute |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | `functionstage_functionstage` |
| **Schema Coverage** | 6 controls (5 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-function
      customer: Example Corp
      title_prefix: "Example FUNCTION"
    defaults:
      region: sa-brazil-1
      billing: ondemand
    resources:
      - id: manifest-generator-fn
        environment: origin
        service: function
        billing: ondemand
        options:
          requests_ten_thousands: 1000
          execution_seconds: 500000
          memory_mb: 512 MB
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example FUNCTION"
    settlement: total
    cards:
      - id: serverless-api
        service: function
        region: sa-brazil-1
        billing: ondemand
        options:
          requests_10k: 1000
          memory_mb: 512
          compute: 100
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: function`, `region`, `billing` (`ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `functionstage_functionstage`. |
| `options.requests_10k` | `number / unit` | `0..1000000000000000 month` (step 1)<br>`0..1000000000000000 day` (step 1)<br>`0..1000000000000000 hour` (step 1) | Average monthly invocations in units of 10,000 counts (e.g. `1000` = 10,000,000 invocations). In declarative quotes, write `requests: 10M` or `invocations: 10M`. *(Portal controls: `calculator_fgs_request_Stepper_0`)* |
| `options.compute` | `string` | Catalog / Enum | Execution compute units / duration (measured in GB-seconds or duration multiplier). In declarative quotes, write `execution_time_ms: 200` or `compute_units: 100`. *(Portal controls: `calculator_fgs_compute`)* |
| `options.memory_mb` | `number / unit` | `128..1024 MB` (step 1)<br>`0..10 GB` (step 1) | Memory allocated per function instance (128 MB to 1024 MB). Default: `512`. *(Portal controls: `calculator_fgs_memory_Stepper_0`)* |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).

---

??? note "Portal Control Schema (autocalc://schema/function) — 6 controls"

    Source file: `src/schema/files/function.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_fgs_request_Stepper_0` | Average Requests (Ten thousand counts) | `base-stepper` | `0..1000000000000000 month` (step 1)<br>`0..1000000000000000 day` (step 1)<br>`0..1000000000000000 hour` (step 1) | Mapped → `requests_10k` |
    | `calculator_fgs_compute` | Execution Compute Units (Duration / GB-s) | `common-input` | Catalog / Enum | Mapped → `compute` |
    | `calculator_fgs_memory_Stepper_0` | Amount of memory allocated | `base-stepper` | `128..1024 MB` (step 1)<br>`0..10 GB` (step 1) | Mapped → `memory_mb` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 2 scenarios passing"

    Source: `docs/compat/function.md` (function compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `ondemand-2m-256mb` | `ok` | `ok` | — |
    | `ondemand-5m-512mb` | `ok` | `ok` | — |
