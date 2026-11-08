# `hss` — Host Security Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `hss` |
| **Category** | Security & Compliance |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `hss_hss` |
| **Schema Coverage** | 6 controls (5 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-hss
      customer: Example Corp
      title_prefix: "Example HSS"
    defaults:
      region: sa-brazil-1
      billing: monthly
    resources:
      - id: compliance-host-security-hss
        environment: prod
        service: hss
        billing: monthly
        quantity: 4
        options:
          edition: Enterprise
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example HSS"
    settlement: total
    cards:
      - id: server-security
        service: hss
        region: sa-brazil-1
        billing: monthly
        quantity: 5
        options:
          edition: dataInfo_4_
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: hss`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `hss_hss`. |
| `options.edition` | `string` | Catalog / Enum | Host security tier token (`dataInfo_1_` Basic, `dataInfo_6_` Enterprise, `dataInfo_4_` Premium, `dataInfo_3_` WTP, `dataInfo_5_` Container). In declarative quotes, write `edition: premium` or `edition: enterprise`. *(Portal controls: `calculator_hssType_radio_type`)* |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **Spec Rule**: `options.edition` must match the catalog SKU edition (`hss.version.basic`, `hss.version.premium`, `hss.version.wtp`, `hss.version.container.enterprise`, `hss.version.advanced`).

---

??? note "Portal Control Schema (autocalc://schema/hss) — 6 controls"

    Source file: `src/schema/files/hss.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_hssType_radio_type` | Edition | `base-radio-group` | Catalog / Enum | Mapped → `edition` |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
    | `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..3000 PCS` (step 1) | Mapped → `quantity` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 3 scenarios passing"

    Source: `docs/compat/hss.md` (hss compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `monthly-premium` | `ok` | `ok` | — |
    | `yearly-wtp` | `ok` | `ok` | — |
    | `ondemand-premium` | `ok` | `ok` | — |
