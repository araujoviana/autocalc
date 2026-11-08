# `sfs` — Scalable File Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `sfs` |
| **Category** | Storage & Backup |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | `sfs_sfs` |
| **Schema Coverage** | 9 controls (5 mapped, 4 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-sfs
      customer: Example Corp
      title_prefix: "Example SFS"
    defaults:
      region: sa-brazil-1
      billing: ondemand
    resources:
      - id: dicom-hot-share-sfs
        environment: prod
        service: sfs
        billing: ondemand
        options:
          storage_space_gb: 5000 GB
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example SFS"
    settlement: total
    cards:
      - id: shared-nfs
        service: sfs
        region: sa-brazil-1
        billing: ondemand
        options:
          capacity_gb: 1000
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: sfs`, `region`, `billing` (`ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `sfs_sfs`. |
| `options.capacity_gb` | `string` | Catalog / Enum | Standard shared file system capacity in GB (minimum 1 GB). In declarative quotes, write `capacity: "1000 GB"` or `size_gb: 1000`. *(Portal controls: `calculator_sfsDemand_radio_Stepper_0`)* |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).
- Monthly and yearly SFS (capacity radio `storageSizeSpec`): offered by the page, not built.

---

??? note "Portal Control Schema (autocalc://schema/sfs) — 9 controls"

    Source file: `src/schema/files/sfs.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_sfsType_radio_fileType` | File System Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `calculator_sfsType_radio_sfsType` | Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `calculator_sfsType_radio_storageSizeSpec` | Storage Space | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
    | `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..10000 PCS` (step 1) | Mapped → `quantity` |
    | `calculator_sfsDemand_radio_Stepper_0` | — | `base-stepper` | Catalog / Enum | Mapped → `capacity_gb` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 2 scenarios passing"

    Source: `docs/compat/sfs.md` (sfs compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `ondemand` | `ok` | `ok` | — |
    | `ondemand-large` | `ok` | `ok` | — |
