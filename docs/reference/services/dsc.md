# `dsc` — Data Security Center

| Property | Value |
| :--- | :--- |
| **Service Code** | `dsc` |
| **Category** | Security & Compliance |
| **Publish Gate Status** | <span class="badge badge--default">DEFAULT_ONLY</span> (Catalog & Replay Only) — *Only page defaults have been accepted; requested configuration is unverified.* |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 8 controls (4 mapped, 4 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-dsc
      customer: Example Corp
      title_prefix: "Example DSC"
    defaults:
      region: sa-brazil-1
      billing: monthly
    resources:
      - id: dsc-main
        service: dsc
        billing: monthly
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example DSC"
    settlement: total
    cards:
      - id: dsc-main
        service: dsc
        region: sa-brazil-1
        billing: monthly
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: dsc`, `region`, `billing` (`monthly` | `yearly`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

*This service uses default calculator form settings and does not expose custom `options`.*

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).

---

??? note "Portal Control Schema (autocalc://schema/dsc) — 8 controls"

    Source file: `src/schema/files/dsc.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_dsc_radio_group_version` | Basic Package Specifications | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `calculator_Traffic_db_stepper_Stepper_0` | Database Expansion Package | `base-stepper` | `0..10000 PCS` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `calculator_Traffic_obs_stepper_Stepper_0` | OBS Expansion Package | `base-stepper` | `0..10000 PCS` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
    | `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `..1` (step 1) | Mapped → `quantity` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 2 scenarios passing"

    Source: `docs/compat/dsc.md` (dsc compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `monthly` | `ok` | `ok` | — |
    | `yearly` | `ok` | `ok` | — |
