# `esw` — Enterprise Switch

| Property | Value |
| :--- | :--- |
| **Service Code** | `esw` |
| **Category** | Networking & Edge |
| **Publish Gate Status** | <span class="badge badge--default">DEFAULT_ONLY</span> (Catalog & Replay Only) — *Only page defaults have been accepted; requested configuration is unverified.* |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 5 controls (3 mapped, 2 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-esw
      customer: Example Corp
      title_prefix: "Example ESW"
    defaults:
      region: sa-brazil-1
      billing: monthly
    resources:
      - id: esw-main
        service: esw
        billing: monthly
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example ESW"
    settlement: total
    cards:
      - id: esw-main
        service: esw
        region: sa-brazil-1
        billing: monthly
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: esw`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

*This service uses default calculator form settings and does not expose custom `options`.*

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).

---

??? note "Portal Control Schema (autocalc://schema/esw) — 5 controls"

    Source file: `src/schema/files/esw.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_esw_radio_eswSpecification` | Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 3 scenarios passing"

    Source: `docs/compat/esw.md` (esw compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `monthly` | `ok` | `ok` | — |
    | `yearly` | `ok` | `ok` | — |
    | `ondemand` | `ok` | `ok` | — |
