# `sdrs` — Storage Disaster Recovery Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `sdrs` |
| **Category** | Storage & Backup |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | `sdrs_hdrsinst` |
| **Schema Coverage** | 6 controls (4 mapped, 2 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-sdrs
  customer: Example Corp
  title_prefix: "Example SDRS"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: storage-disaster-recovery-sdrs
    environment: dr
    service: sdrs
    billing: ondemand
    options:
      quantity: 2
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: sdrs`, `region`, `billing` (`ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `sdrs_hdrsinst`. |
| `options.protection_groups` | `number / unit` | `1..1000` (step 1) | Maps to portal control `calculator_sdrs_stepper_Stepper_0`. |
| `options.hours` | `number / unit` | `1..9999 hour` (step 1) | **Required Duration**. Maps to portal control `global_ONDEMANDTIME_Stepper_0`. |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).

---

## Portal Control Schema (`autocalc://schema/sdrs`)

Source file: `src/schema/files/sdrs.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_sdrs_stepper_replicationType` | DR Server | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_sdrs_stepper_Stepper_0` | — | `base-stepper` | `1..1000` (step 1) | Mapped → `protection_groups` |
| `global_ONDEMANDTIME_Stepper_0` | Required Duration | `base-stepper` | `1..9999 hour` (step 1) | Mapped → `hours` |

---

## Live Compatibility Replay

Source: `docs/compat/sdrs.md` (sdrs compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `groups-5` | `ok` | `ok` | — |
| `groups-100` | `ok` | `ok` | — |
