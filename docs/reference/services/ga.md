# `ga` — Global Accelerator

| Property | Value |
| :--- | :--- |
| **Service Code** | `ga` |
| **Category** | Networking & Edge |
| **Publish Gate Status** | <span class="badge badge--default">DEFAULT_ONLY</span> (Catalog & Replay Only) — *Only page defaults have been accepted; requested configuration is unverified.* |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 6 controls (1 mapped, 5 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-ga
      customer: Example Corp
      title_prefix: "Example GA"
    defaults:
      region: sa-brazil-1
      billing: ondemand
    resources:
      - id: ga-main
        service: ga
        billing: ondemand
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example GA"
    settlement: total
    cards:
      - id: ga-main
        service: ga
        region: sa-brazil-1
        billing: ondemand
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: ga`, `region`, `billing` (`ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

*This service uses default calculator form settings and does not expose custom `options`.*

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).
- **Global / Regionless Form**: This service's calculator page omits the standard region selector (`regionless: true`).

---

??? note "Portal Control Schema (autocalc://schema/ga) — 6 controls"

    Source file: `src/schema/files/ga.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_ga_stepper_main_SourceEndpoint` | Access Point | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `calculator_ga_stepper_main_DestinationEndpoint` | Region | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `calculator_ga_stepper_main_Stepper_0` | Traffic | `base-stepper` | `1..99999999999` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `calculator_accelerator_stepper_Stepper_0` | Required Duration | `base-stepper` | `1..99999999999 hour` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 1 scenarios passing"

    Source: `docs/compat/ga.md` (ga compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `ondemand` | `ok` | `ok` | — |
