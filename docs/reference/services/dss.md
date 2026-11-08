# `dss` — Dedicated Distributed Storage Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `dss` |
| **Category** | Storage & Backup |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `yearly` |
| **Primary Catalog Group** | `dss_dss.pool` |
| **Schema Coverage** | 6 controls (5 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-dss
      customer: Example Corp
      title_prefix: "Example DSS"
    defaults:
      region: sa-brazil-1
      billing: yearly
    resources:
      - id: dedicated-san-dss
        environment: prod
        service: dss
        billing: monthly
        options:
          type: ultra-high-io
          size_tb: 43.35 TB
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example DSS"
    settlement: total
    cards:
      - id: dedicated-storage-pool
        service: dss
        region: sa-brazil-1
        billing: yearly
        spec: DSS.SAS
        options:
          type: SAS
          capacity: 43.350 TB
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: dss`, `region`, `billing` (`yearly`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `dss_dss.pool`. |
| `options.type` | `string` | Catalog / Enum | Dedicated storage pool media type: `SAS` (High I/O) or `SSD` (Ultra-high I/O). *(Portal controls: `calculator_dssDemand_radio_type`)* |
| `options.capacity` | `string` | Catalog / Enum | Discrete dedicated pool division size (e.g. `43.350 TB` for SAS, `13.600 TB` for SSD). *(Portal controls: `calculator_dssDemand_radio_dssDivision`)* |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).
- **Usage-Priced (`USAGE_PRICED`)**: Pay-per-use SKUs carry usage plans rather than a flat catalog list price; `plan-quote` resolves the SKU, and exact usage rating runs during `apply-quote` / `quote`.
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `type` (from SKU `type`).

---

??? note "Portal Control Schema (autocalc://schema/dss) — 6 controls"

    Source file: `src/schema/files/dss.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_dssDemand_radio_type` | Type | `base-radio-group` | Catalog / Enum | Mapped → `type` |
    | `calculator_dssDemand_radio_dssDivision` | Capacity | `base-select` | Catalog / Enum | Mapped → `capacity` |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 2 scenarios passing"

    Source: `docs/compat/dss.md` (dss compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `yearly-type2` | `ok` | `ok` | — |
    | `yearly-type3` | `ok` | `ok` | — |
