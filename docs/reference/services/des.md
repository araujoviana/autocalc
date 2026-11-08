# `des` — Data Express Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `des` |
| **Category** | Storage & Backup |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | `des_des` |
| **Schema Coverage** | 7 controls (5 mapped, 2 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-des
  customer: Example Corp
  title_prefix: "Example DES"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: offline-seed-des
    environment: prod
    service: des
    billing: ondemand
    options:
      media: disk
      devices: 2
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: des`, `region`, `billing` (`ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `des_des`. |
| `options.transfer_type` | `string` | Catalog / Enum | **Transmission Mode**. Maps to portal control `calculator_product_select_transferTypeClass`. |
| `options.devices` | `number / unit` | `1..99 day` (step 1) | **Teleport Onsite Duration**. Maps to portal control `calculator_product_stepper_Stepper_0`. |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `transfer_type` (from SKU `transferTypeClass`).
- **Spec Rule**: `options.devices` (onsite days) is valid only on Teleport specs (`des.teleport.*`), not `des.disk`.

---

## Portal Control Schema (`autocalc://schema/des`)

Source file: `src/schema/files/des.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_product_select_transferTypeClass` | Transmission Mode | `base-radio-group` | Catalog / Enum | Mapped → `transfer_type` |
| `calculator_product_select_teleportSpec` | Teleport Specification | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_product_stepper_Stepper_0` | Teleport Onsite Duration | `base-stepper` | `1..99 day` (step 1) | Mapped → `devices` |
| `global_QUANTITY_Stepper_0` | Required Quantity | `base-stepper` | `1..99 amount` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/des.md` (des compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `type-11` | `ok` | `ok` | — |
| `type-12` | `ok` | `ok` | — |
