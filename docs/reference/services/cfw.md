# `cfw` — Cloud Firewall

| Property | Value |
| :--- | :--- |
| **Service Code** | `cfw` |
| **Category** | Security & Compliance |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `cfw_cfw` |
| **Schema Coverage** | 7 controls (6 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-cfw
  customer: Example Corp
  title_prefix: "Example CFW"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: hospital-perimeter-cfw
    environment: prod
    service: cfw
    billing: monthly
    options:
      edition: Standard
      eips: 5
      bandwidth_mbps: 20 Mbps
```

### Plain Card (`cards:`)

```yaml
customer: Example Corp
name: "Example CFW"
settlement: total
cards:
  - id: edge-firewall
    service: cfw
    region: sa-brazil-1
    billing: monthly
    options:
      edition: detail_3_
      bandwidth_mbps: 10
      eips: 1
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: cfw`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `cfw_cfw`. |
| `options.edition` | `string` | Catalog / Enum | Firewall edition token: `detail_3_` for Standard, `detail_11_` for Professional. In declarative quotes, write `edition: standard` or `edition: professional`. *(Portal controls: `calculator_cfw_editionRadio_edition`)* |
| `options.eips` | `number / unit` | `0..2000 PCS` (step 1) | Additional protected public IP addresses beyond the edition baseline. Alias: `protected_eips`. *(Portal controls: `calculator_cfw_eipStepper_Stepper_0`)* |
| `options.bandwidth_mbps` | `number / unit` | `0..20000 Mbit/s` (step 5) | Additional internet border protection bandwidth in Mbit/s (in 5 Mbit/s increments). Alias: `protection_bandwidth_mbps`. *(Portal controls: `calculator_cfw_bandwidthStepper_Stepper_0`)* |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).

---

## Portal Control Schema (`autocalc://schema/cfw`)

Source file: `src/schema/files/cfw.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_cfw_editionRadio_edition` | Edition | `base-radio-group` | Catalog / Enum | Mapped → `edition` |
| `calculator_cfw_eipStepper_Stepper_0` | Add EIP Protection Capacity | `base-stepper` | `0..2000 PCS` (step 1) | Mapped → `eips` |
| `calculator_cfw_bandwidthStepper_Stepper_0` | Add Internet Border Protection Bandwidth | `base-stepper` | `0..20000 Mbit/s` (step 5) | Mapped → `bandwidth_mbps` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

## Live Compatibility Replay

Source: `docs/compat/cfw.md` (cfw compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `monthly-standard` | `ok` | `ok` | — |
| `yearly-standard` | `ok` | `ok` | — |
| `ondemand-professional` | `ok` | `ok` | — |
