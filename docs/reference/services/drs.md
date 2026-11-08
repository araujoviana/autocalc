# `drs` — Data Replication Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `drs` |
| **Category** | Databases & Cache |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `drs_drs.vm` |
| **Schema Coverage** | 8 controls (7 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-drs
  customer: Example Corp
  title_prefix: "Example DRS"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: db-replication-drs
    environment: prod
    service: drs
    billing: ondemand
    options:
      direction: up
      task_type: sync-single
      spec: medium
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: drs`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `drs_drs.vm`. |
| `options.type` | `string` | Catalog / Enum | **Task Type**. Maps to portal control `calculator_drsvm_radio_drsType`. |
| `options.flow` | `string` | Catalog / Enum | **Data Flow**. Maps to portal control `calculator_drsvm_radio_flowInout`. |
| `options.specification` | `string` | Catalog / Enum | **Specifications**. Maps to portal control `calculator_drsvm_radio_specificationType`. |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `type` (from SKU `drsType`), `flow` (from SKU `flowInout`), `specification` (from SKU `specificationType`).

---

## Portal Control Schema (`autocalc://schema/drs`)

Source file: `src/schema/files/drs.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_drsvm_radio_drsType` | Task Type | `base-radio-group` | Catalog / Enum | Mapped → `type` |
| `calculator_drsvm_radio_flowInout` | Data Flow | `base-radio-group` | Catalog / Enum | Mapped → `flow` |
| `calculator_drsvm_radio_specificationType` | Specifications | `base-radio-group` | Catalog / Enum | Mapped → `specification` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..4000 PCS` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/drs.md` (drs compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-sync` | `ok` | `ok` | — |
| `monthly-dr` | `ok` | `ok` | — |
| `yearly-dr` | `ok` | `ok` | — |
