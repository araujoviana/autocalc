# `er` — Enterprise Router

| Property | Value |
| :--- | :--- |
| **Service Code** | `er` |
| **Category** | Networking & Edge |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | `er_er.attachment` |
| **Schema Coverage** | 6 controls (5 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-er
  customer: Example Corp
  title_prefix: "Example ER"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: inter-vpc-enterprise-router
    environment: prod
    service: er
    billing: ondemand
    options:
      attachments: 4
      traffic_gb: 2000 GB
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: er`, `region`, `billing` (`ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `er_er.attachment`. |
| `options.attachments` | `number / unit` | `0..9999 PCS` (step 1) | **Attachment Quantity**. Maps to portal control `calculator_attachment_stepper_Stepper_0`. |
| `options.attachment_hours` | `number / unit` | `1..999999 hour` (step 1) | **Required Duration**. Maps to portal control `calculator_attachment_time_stepper_Stepper_0`. |
| `options.downflow_gb` | `number / unit` | `1..999999 GB` (step 1) | **Traffic**. Maps to portal control `calculator_downflow_stepper_Stepper_0`. |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).

---

## Portal Control Schema (`autocalc://schema/er`)

Source file: `src/schema/files/er.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_attachment_stepper_Stepper_0` | Attachment Quantity | `base-stepper` | `0..9999 PCS` (step 1) | Mapped → `attachments` |
| `calculator_attachment_time_stepper_Stepper_0` | Required Duration | `base-stepper` | `1..999999 hour` (step 1) | Mapped → `attachment_hours` |
| `calculator_downflow_stepper_Stepper_0` | Traffic | `base-stepper` | `1..999999 GB` (step 1) | Mapped → `downflow_gb` |

---

## Live Compatibility Replay

Source: `docs/compat/er.md` (er compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `traffic-attachments` | `ok` | `ok` | — |
| `single-attachment` | `ok` | `ok` | — |
