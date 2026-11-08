# `sfsturbo` — Scalable File Service Turbo

| Property | Value |
| :--- | :--- |
| **Service Code** | `sfsturbo` (aliases: `sfs-turbo`, `sfs_turbo`) |
| **Category** | Storage & Backup |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand`, `monthly`, `yearly` |
| **Primary Catalog Group** | `sfsturbo_sfsturbo` |
| **Schema Coverage** | 9 controls (8 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-sfsturbo
  customer: Example Corp
  title_prefix: "Example SFSTURBO"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: shared-segment-sfsturbo
    environment: origin
    service: sfsturbo
    billing: monthly
    options:
      tier: 40MBps
      capacity: 4 TB
```

### Plain Card (`cards:`)

```yaml
customer: Example Corp
name: "Example SFSTURBO"
settlement: total
cards:
  - id: high-iops-nfs
    service: sfsturbo
    region: sa-brazil-1
    billing: yearly
    options:
      tier: 20MBps
      size_gb: 3686.4
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: sfsturbo`, `region`, `billing` (`ondemand` | `monthly` | `yearly`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` / `options.tier` | `string` | Catalog SKU | Resolved catalog specification code (group `sfsturbo_sfsturbo`). Can also be selected via `needs:`. |
| `options.tier` | `string` | Catalog / Enum | Throughput performance tier: `20MBps`, `40MBps`, `125MBps`, `250MBps`, `500MBps`, `1000MBps`. In declarative `version: "1"`, write `throughput: 40MBps`. *(Portal controls: `calculator_sfsType_radio_fileType`, `calculator_sfsType_radio_sellingStatus`, `calculator_sfsType_radio_sfsType`)* |
| `options.size_gb` | `string` | Catalog / Enum | File system capacity in GB (must be a multiple of 0.1 TB = 102.4 GB; min 3686.4 GB for `20MBps`, 1228.8 GB for others). In declarative quotes, write `capacity: "4 TB"`. *(Portal controls: `calculator_sfsPeriod_36input`)* |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.

---

## Portal Control Schema (`autocalc://schema/sfsturbo`)

Source file: `src/schema/files/sfsturbo.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_sfsType_radio_fileType` | File System Type | `base-radio-group` | Catalog / Enum | Mapped → `tier` |
| `calculator_sfsType_radio_sellingStatus` | — | `base-radio-group` | Catalog / Enum | Mapped → `tier` |
| `calculator_sfsType_radio_sfsType` | Type | `base-radio-group` | Catalog / Enum | Mapped → `tier` |
| `calculator_sfsPeriod_36input` | detail_31_ | `common-input` | Catalog / Enum | Mapped → `size_gb` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..10000 PCS` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/sfsturbo.md` (sfsturbo compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `yearly-default` | `ok` | `ok` | — |
| `monthly-20` | `ok` | `ok` | — |
| `ondemand-40` | `ok` | `ok` | — |
| `monthly-250` | `ok` | `ok` | — |
| `monthly-125` | `ok` | `ok` | — |
