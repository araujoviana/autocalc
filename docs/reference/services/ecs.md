# `ecs` — Elastic Cloud Server

| Property | Value |
| :--- | :--- |
| **Service Code** | `ecs` |
| **Category** | Compute |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand`, `ri` (Reserved Instance) |
| **Primary Catalog Group** | `ec2_vm` |
| **Schema Coverage** | 19 controls (16 mapped, 3 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-ecs
  customer: Example Corp
  title_prefix: "Example ECS"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: storefront-api-nodes
    service: ecs
    environment: prod
    quantity: 6
    billing: yearly
    needs:
      vcpus: 8
      memory: 32 GiB
    options:
      os: ubuntu-22.04
      system_disk:
        type: high-io
        size: 100 GiB
```

### Plain Card (`cards:`)

```yaml
customer: Example Corp
name: "Example ECS"
settlement: total
cards:
  - id: web-tier
    service: ecs
    region: sa-brazil-1
    billing: monthly
    quantity: 2
    needs: { vcpus: 4, memory_gb: 8 }
    options:
      image: "Ubuntu 22.04 server 64bit"
      system_disk: [GPSSD, 100]
      bandwidth_mbit: 10
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: ecs`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` / `options.flavor` | `string` | Catalog SKU | Resolved catalog specification code (group `ec2_vm`). Can also be selected via `needs:`. |
| `options.flavor` | `string` | Catalog / Enum | Resolved catalog CPU architecture and flavor specification (group `ec2_vm`). In declarative `version: "1"`, choose via `needs: { vcpus: N, memory_gb: N }`. *(Portal controls: `calculator_ecs_radio_arch`, `calculator_ecs_radio_vmType`, `calculator_ecs_radio_generation`, `calculator_ecs_radio_cpu`, `calculator_ecs_radio_mem`)* |
| `options.image` | `string` | Catalog / Enum | Operating system image label (e.g. `Ubuntu 22.04 server 64bit`, `AlmaLinux 9.4 64bit`). In declarative `version: "1"`, friendly shorthands like `os: ubuntu-22.04` or `alma-9.4` normalize automatically. Bare `AlmaLinux` is rejected as ambiguous. *(Portal controls: `calculator_ims_select___platform`, `calculator_ims_select_name`)* |
| `options.system_disk` | `number / unit` | `40..1024 GiB` (step 10) | System volume tuple `[TYPE, SIZE_GB]` or `{ type, size }` (40–1024 GB). Types: `GPSSD`, `SSD`, `SAS`, `GPSSD2`, `ESSD`. Default: `['GPSSD', 40]`. *(Portal controls: `calculator_evs_stepper_main_type`, `calculator_evs_stepper_main_Stepper_0`)* |
| `options.bandwidth_mbit` | `number / unit` | `5..2000` (step 1) when `^19_share`<br>`1..2000` (step 1) when `^19_s?bgp`<br>`1..9999` (step 1) when `^12_` | Dedicated EIP bandwidth in Mbit/s (1–2000 Mbit/s for BGP, 1–9999 GB for traffic). In declarative quotes, write `bandwidth: 10 Mbps`. *(Portal controls: `calculator_eip_switch_UNSET_Switch`, `calculator_eip_radio_Stepper_1`)* |
| `options.bandwidth_type` | `string` | Catalog / Enum | EIP billing mode (`19_bgp` for by-bandwidth, `12_bgp` for by-traffic). *(Portal controls: `calculator_eip_radio_eipType`)* |
| `options.data_disks` | `any` | Builder-validated | List of attached data volumes `[[TYPE, SIZE_GB], ...]`. |
| `options.ri_time` | `any` | Builder-validated | Reserved instance commitment term (`1_3` for 1-year or `3_3` for 3-year; requires `billing: ri`). |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- BYOL flavors (`.byol`): the page builds the `.linux` spec for them, so a `.byol` card cannot match; not offered.
- The default image `AlmaLinux` matches every AlmaLinux release, so cards must name one (`AlmaLinux 9.4 64bit`); this is deliberate (plan flags it).
- Windows flavors (`.win`): none are sold in sa-brazil-1 (checked in the catalog); the `.win` suffix is accepted but unverified live.

---

## Portal Control Schema (`autocalc://schema/ecs`)

Source file: `src/schema/files/ecs.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_ecs_radio_arch` | CPU Architecture | `base-radio-group` | Catalog / Enum | Mapped → `flavor` |
| `calculator_ecs_radio_vmType` | Type | `base-radio-group` | Catalog / Enum | Mapped → `flavor` |
| `calculator_ecs_radio_generation` | — | `base-radio-group` | Catalog / Enum | Mapped → `flavor` |
| `calculator_ecs_radio_cpu` | — | `base-radio-group` | Catalog / Enum | Mapped → `flavor` |
| `calculator_ecs_radio_mem` | — | `base-radio-group` | Catalog / Enum | Mapped → `flavor` |
| `calculator_ims_select___platform` | Image | `base-select` | Catalog / Enum | Mapped → `image` |
| `calculator_ims_select_name` | — | `base-select` | Catalog / Enum | Mapped → `image` |
| `calculator_evs_stepper_main_type` | System Disk | `base-select` | Catalog / Enum | Mapped → `system_disk` |
| `calculator_evs_stepper_main_Stepper_0` | — | `base-stepper` | `40..1024 GiB` (step 10) | Mapped → `system_disk` |
| `calculator_eip_switch_UNSET_Switch` | EIP | `base-radio-group` | Catalog / Enum | Mapped → `bandwidth_mbit` |
| `calculator_eip_radio_eipSpec` | EIP Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (fixed to the default EIP spec by the recipe) |
| `calculator_eip_radio_shareType` | Bandwidth Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (fixed to dedicated bandwidth by the recipe) |
| `calculator_eip_radio_eipType` | Billed By | `base-radio-group` | Catalog / Enum | Mapped → `bandwidth_type` |
| `calculator_eip_radio_Stepper_1` | Bandwidth Size | `base-stepper` | `5..2000` (step 1) when `^19_share`<br>`1..2000` (step 1) when `^19_s?bgp`<br>`1..9999` (step 1) when `^12_` | Mapped → `bandwidth_mbit` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..1000 ECS` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/ecs.md` (ecs compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `monthly` | `ok` | `ok` | — |
| `yearly` | `ok` | `ok` | — |
| `ondemand` | `ok` | `ok` | — |
| `ri-1y` | `ok` | `ok` | — |
| `ri-3y` | `ok` | `ok` | — |
| `quantity-5` | `ok` | `ok` | — |
| `image-ubuntu` | `ok` | `ok` | — |
| `disks-mixed` | `ok` | `ok` | — |
| `disks-ondemand` | `ok` | `ok` | — |
| `bandwidth-bgp-monthly` | `ok` | `ok` | — |
| `bandwidth-bgp-yearly` | `ok` | `ok` | — |
| `bandwidth-traffic` | `ok` | `ok` | — |
| `bandwidth-ri` | `ok` | `ok` | — |
| `flavor-large` | `ok` | `ok` | — |
