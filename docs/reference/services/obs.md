# `obs` — Object Storage Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `obs` |
| **Category** | Storage & Backup |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand`, `monthly`, `yearly` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 9 controls (7 mapped, 2 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-obs
      customer: Example Corp
      title_prefix: "Example OBS"
    defaults:
      region: sa-brazil-1
      billing: ondemand
    resources:
      - id: product-media-obs
        environment: edge
        service: obs
        billing: ondemand
        options:
          storage_class: standard
          capacity: 10 TB
          traffic: 5 TB/mo
          read_requests: 5000k
          write_requests: 500k
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example OBS"
    settlement: total
    cards:
      - id: object-store
        service: obs
        region: sa-brazil-1
        billing: ondemand
        options:
          storage_class: standard
          multi_az: true
          components:
            - { factor: size_3az, value: 10, unit: TB }
            - { factor: download.external, value: 1000 }
            - { factor: get, value: 500 }
            - { factor: put, value: 50 }
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: obs`, `region`, `billing` (`ondemand` | `monthly` | `yearly`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `options.package` | `string` | Catalog / Enum | Prepaid Standard storage package (`40gb` to `10pb`). Requires `monthly` or `yearly` billing. *(Portal controls: `calculator_Pack_checkboxGroup_packageType`, `calculator_storagePack_radio_obsStorageSize`)* |
| `options.traffic_package` | `string` | Catalog / Enum | Prepaid outbound traffic package (`50gb` to `300tb`, or `none`). Requires `package`. *(Portal controls: `calculator_Outbound_radio_obsDownTrafficSize`)* |
| `options.components` | `any` | Builder-validated | Explicit usage lines (`size`, `size_3az`, `download.external`, `get`, `put`, etc.). In `version: "1"`, high-level human options (`capacity: "10 TB"`, `traffic: "5 TB/mo"`, `read_requests: "5000k/mo"`, `write_requests: "500k/mo"`) compile into `components` automatically. |
| `options.months` | `any` | Builder-validated | Duration in months (1–12) for pay-per-use usage cards. |
| `options.multi_az` | `any` | Builder-validated | Enable 3-AZ redundancy (`true` or `false`). In declarative quotes, write `redundancy: multi-az` or `availability: multi-az`. Not supported on `cold` pay-per-use storage. |
| `options.storage_class` | `any` | Builder-validated | Storage tier: `standard`, `warm` (Infrequent Access), or `cold` (Archive). Default: `standard`. |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).
- **Usage-Priced (`USAGE_PRICED`)**: Pay-per-use SKUs carry usage plans rather than a flat catalog list price; `plan-quote` resolves the SKU, and exact usage rating runs during `apply-quote` / `quote`.
- **Known Vendor Portal Defect (`GH-2-OBS-STORAGE-EDIT-DROP` on `ondemand`)**: Pay-per-use OBS cards reset storage line to 0 on Edit when storageType_switch momentarily clears pending state. *(Vendor calculator SPA clears OBS storage line on Edit. Official CBC rating API price was verified and preserved.)*
- Parallel file system (`calc_30_`): the live page keeps the typed capacity in the form but emits no capacity product (only egress, get, put, delete), so a capacity line cannot be encoded or verified (2026-11-07, sa-brazil-1).
- Deep Archive (`dataInfo_22_`): not a real feature; out of scope.
- ru-moscow-1: not in the page's region list, so it cannot be replayed; its class tokens (`dataInfo_25_`/`26_`) come from the catalog and are covered by an offline test.

---

??? note "Portal Control Schema (autocalc://schema/obs) — 9 controls"

    Source file: `src/schema/files/obs.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_productType_switch_productType` | Product Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (fixed to object storage by the builder) |
    | `calculator_Pack_checkboxGroup_packageType` | Package Type | `base-checkbox-group` | Catalog / Enum | Mapped → `package` |
    | `calculator_storagePack_radio_obsStorageSize` | Storage Space | `base-radio-group` | Catalog / Enum | Mapped → `package` |
    | `calculator_Outbound_radio_obsDownTrafficSize` | Internet Outbound Traffic | `base-radio-group` | Catalog / Enum | Mapped → `traffic_package` |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
    | `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..99 PCS` (step 1) | Mapped → `quantity` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 16 scenarios passing"

    Source: `docs/compat/obs.md` (obs compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `std` | `ok` | `ok` | — |
    | `std-3az` | `ok` | `ok` | — |
    | `warm` | `ok` | `ok` | — |
    | `warm-3az` | `ok` | `ok` | — |
    | `cold` | `ok` | `ok` | — |
    | `pkg-monthly` | `ok` | `ok` | — |
    | `pkg-yearly` | `ok` | `ok` | — |
    | `pkg-3az-yearly` | `ok` | `ok` | — |
    | `pkg-3az-monthly` | `ok` | `ok` | — |
    | `pkg-traffic-1tb` | `ok` | `ok` | — |
    | `pkg-no-traffic` | `ok` | `ok` | — |
    | `pkg-3az-100gb` | `ok` | `ok` | — |
    | `cold-restore-standard` | `ok` | `ok` | — |
    | `cold-direct-read` | `ok` | `ok` | — |
    | `months-3` | `ok` | `ok` | — |
    | `months-12-warm` | `ok` | `ok` | — |
