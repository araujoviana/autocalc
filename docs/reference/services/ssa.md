# `ssa` — Situation Awareness

| Property | Value |
| :--- | :--- |
| **Service Code** | `ssa` |
| **Category** | Security & Compliance |
| **Publish Gate Status** | `CATALOG_ONLY` (Unverified Form Mapping) — *Selected catalog specs have no verified form mapping.* |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | `sa_secmaster.typical` |
| **Schema Coverage** | 15 controls (4 mapped, 11 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-ssa
  customer: Example Corp
  title_prefix: "Example SSA"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: ssa-main
    service: ssa
    billing: ondemand
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: ssa`, `region`, `billing` (`ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `sa_secmaster.typical`. |
| `options.edition` | `string` | Catalog / Enum | **Specification**. Maps to portal control `calculator_ssa_edition_version1`. |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).

---

## Portal Control Schema (`autocalc://schema/ssa`)

Source file: `src/schema/files/ssa.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_ssa_edition_version1` | Specification | `base-radio-group` | Catalog / Enum | Mapped → `edition` |
| `calculator_ssa_api2_Stepper_0` | Quota | `base-stepper` | `1..99999 PCS` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_ssa_largrScreen_UNSET_Switch` | Large Screen | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_ssa_siem_UNSET_Switch` | Log Audit | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_ssa_collectionstepper_Stepper_0` | New Log | `base-stepper` | `0..500 GB/Day` (step 5) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_ssa_retentionstepper_Stepper_0` | Log Retention Duration | `base-stepper` | `1..180 day` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_ssa_siem_checkboxGroup_product1` | — | `base-checkbox-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_ssa_soar_UNSET_Switch` | SOAR | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_ssa_soarstepper_Stepper_0` | — | `base-stepper` | `1..9999 quotas (operations)/day` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_ssa_insight_UNSET_Switch` | Security Analysis | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_ssa_insightstepper_Stepper_0` | — | `base-stepper` | `1..9999 GB/Day` (step 1) | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

## Live Compatibility Replay

Source: `docs/compat/ssa.md` (ssa compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-professional` | `ok` | `ok` | — |
