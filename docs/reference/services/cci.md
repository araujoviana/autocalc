# `cci` — Cloud Container Instance

| Property | Value |
| :--- | :--- |
| **Service Code** | `cci` |
| **Category** | Containers |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | — |
| **Schema Coverage** | 9 controls (4 mapped, 5 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-cci
  customer: Example Corp
  title_prefix: "Example CCI"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: tournament-burst-cci
    environment: latam_south
    service: cci
    billing: ondemand
    options:
      vcpus: 32
      memory_gb: 64 GB
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: cci`, `region`, `billing` (`ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `options.mem_gb` | `any` | Builder-validated | Container memory allocation in GB (1–512 GB). |
| `options.vcpu` | `any` | Builder-validated | Container vCPU allocation (1–512). |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).

---

## Portal Control Schema (`autocalc://schema/cci`)

Source file: `src/schema/files/cci.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_cciSpec_radio_arch` | CPU Architecture | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (builder prices on-demand container CPU and memory) |
| `calculator_cciSpec_radio_productType` | Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (builder prices on-demand container CPU and memory) |
| `calculator_cciSpec_radio_specType` | Package | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (resource packages are not used by the on-demand builder) |
| `calculator_cciSpec_radio_gpu` | — | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (GPU pods are not used by the CPU/memory builder) |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..999 PCS` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/cci.md` (cci compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-2u4g` | `ok` | `ok` | — |
| `ondemand-4u8g` | `ok` | `ok` | — |
