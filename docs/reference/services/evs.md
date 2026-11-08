# `evs` — Elastic Volume Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `evs` |
| **Category** | Storage & Backup |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand`, `monthly`, `yearly` |
| **Primary Catalog Group** | `ebs_volume` |
| **Schema Coverage** | 7 controls (6 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-evs
      customer: Example Corp
      title_prefix: "Example EVS"
    defaults:
      region: sa-brazil-1
      billing: ondemand
    resources:
      - id: sap-hana-log-evs
        environment: prod
        service: evs
        billing: monthly
        quantity: 4
        options:
          type: extreme-ssd
          size: 500 GiB
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example EVS"
    settlement: total
    cards:
      - id: data-volume
        service: evs
        region: sa-brazil-1
        billing: monthly
        quantity: 3
        spec: GPSSD
        options:
          size_gb: 500
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: evs`, `region`, `billing` (`ondemand` | `monthly` | `yearly`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` / `options.type` | `string` | Catalog SKU | Resolved catalog specification code (group `ebs_volume`). Can also be selected via `needs:`. |
| `options.type` | `string` | Catalog / Enum | Volume storage class: `GPSSD` (General-Purpose SSD), `SSD` (Ultra-high I/O), `SAS` (High I/O), `ESSD` (Extreme SSD), `GPSSD2`, `ESSD2`. In declarative `version: "1"`, write `volume_type: general-ssd`. *(Portal controls: `calculator_product_stepper_productType`)* |
| `options.size_gb` | `number / unit` | `10..32768 detail_42_` (step 10) | Disk capacity in GB (minimum 10 GB). In declarative `version: "1"`, supports unit strings like `size: 500 GiB`. *(Portal controls: `calculator_product_stepper_Stepper_0`)* |
| `options.iops` | `any` | Builder-validated | Provisioned IOPS (applies only to on-demand `GPSSD2` or `ESSD2` volumes). |
| `options.throughput` | `any` | Builder-validated | Provisioned throughput in MB/s (applies only to on-demand `GPSSD2` volumes). |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- ESSD2: the page in sa-brazil-1 does not list it (`calc_10_` is not offered), so it cannot be replayed there.

---

??? note "Portal Control Schema (autocalc://schema/evs) — 7 controls"

    Source file: `src/schema/files/evs.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_product_stepper_productType` | Disk Capacity | `base-select` | Catalog / Enum | Mapped → `type` |
    | `calculator_product_stepper_Stepper_0` | — | `base-stepper` | `10..32768 detail_42_` (step 10) | Mapped → `size_gb` |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
    | `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..10000 disk` (step 1) | Mapped → `quantity` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 9 scenarios passing"

    Source: `docs/compat/evs.md` (evs compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `gpssd-ondemand` | `ok` | `ok` | — |
    | `gpssd-monthly` | `ok` | `ok` | — |
    | `gpssd-yearly` | `ok` | `ok` | — |
    | `ssd` | `ok` | `ok` | — |
    | `sas` | `ok` | `ok` | — |
    | `sata` | `ok` | `ok` | — |
    | `essd` | `ok` | `ok` | — |
    | `gpssd2-ondemand` | `ok` | `ok` | — |
    | `quantity-3` | `ok` | `ok` | — |
