# `ddm` — Distributed Database Middleware

| Property | Value |
| :--- | :--- |
| **Service Code** | `ddm` |
| **Category** | Databases & Cache |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `ddm_ddm` |
| **Schema Coverage** | 7 controls (6 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-ddm
      customer: Example Corp
      title_prefix: "Example DDM"
    defaults:
      region: sa-brazil-1
      billing: monthly
    resources:
      - id: sharding-middleware-ddm
        environment: prod
        service: ddm
        billing: ondemand
        options:
          flavor: ddm.4u8g.node
          nodes: 2
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example DDM"
    settlement: total
    cards:
      - id: database-middleware
        service: ddm
        region: sa-brazil-1
        billing: monthly
        quantity: 2
        options:
          spec_type: c6
          spec: ddm.c6.2xlarge.2
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: ddm`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `ddm_ddm`. |
| `options.spec_type` | `string` | Catalog / Enum | Instance class: `c6` (High-performance) or `s6` (General-purpose). *(Portal controls: `calculator_insSpec_radio_specType`)* |
| `options.spec` | `string` | Catalog / Enum | Node specification code (e.g. `ddm.c6.2xlarge.2` for 8 vCPUs / 16 GB). Node count is configured via card `quantity` (≥ 2). *(Portal controls: `calculator_insSpec_radio_specBefore`)* |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `spec_type` (from SKU `specType`), `spec` (from SKU `specBefore`).

---

??? note "Portal Control Schema (autocalc://schema/ddm) — 7 controls"

    Source file: `src/schema/files/ddm.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_insSpec_radio_specType` | Instance Class | `base-radio-group` | Catalog / Enum | Mapped → `spec_type` |
    | `calculator_insSpec_radio_specBefore` | — | `base-select` | Catalog / Enum | Mapped → `spec` |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
    | `global_QUANTITY_Stepper_0` | Instance Nodes | `base-stepper` | `1..32 PCS` (step 1) | Mapped → `quantity` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 3 scenarios passing"

    Source: `docs/compat/ddm.md` (ddm compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `ondemand-c6-8xlarge` | `ok` | `ok` | — |
    | `monthly-c6-8xlarge` | `ok` | `ok` | — |
    | `yearly-c6-8xlarge` | `ok` | `ok` | — |
