# `ucs` — Ubiquitous Cloud Native Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `ucs` |
| **Category** | Containers |
| **Publish Gate Status** | <span class="badge badge--default">DEFAULT_ONLY</span> (Catalog & Replay Only) — *Only page defaults have been accepted; requested configuration is unverified.* |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 5 controls (2 mapped, 3 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-ucs
      customer: Example Corp
      title_prefix: "Example UCS"
    defaults:
      region: sa-brazil-1
      billing: monthly
    resources:
      - id: ucs-main
        service: ucs
        billing: monthly
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example UCS"
    settlement: total
    cards:
      - id: ucs-main
        service: ucs
        region: sa-brazil-1
        billing: monthly
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: ucs`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

*This service uses default calculator form settings and does not expose custom `options`.*

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).
- **Global / Regionless Form**: This service's calculator page omits the standard region selector (`regionless: true`).

---

??? note "Portal Control Schema (autocalc://schema/ucs) — 5 controls"

    Source file: `src/schema/files/ucs.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_ucsType_radio_package_clusterType` | Cluster Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `calculator_ucsType_radio_package_Stepper_0` | Management core count | `base-stepper` | `1..10000 dataInfo_8_` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 3 scenarios passing"

    Source: `docs/compat/ucs.md` (ucs compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `monthly` | `ok` | `ok` | — |
    | `yearly` | `ok` | `ok` | — |
    | `ondemand` | `ok` | `ok` | — |
