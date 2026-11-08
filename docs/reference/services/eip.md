# `eip` — Elastic IP

| Property | Value |
| :--- | :--- |
| **Service Code** | `eip` |
| **Category** | Networking & Edge |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `vpc_bandwidth` |
| **Schema Coverage** | 9 controls (5 mapped, 4 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-eip
  customer: Example Corp
  title_prefix: "Example EIP"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: nat-public-eip
    environment: prod
    service: eip
    billing: ondemand
    options:
      traffic_gb: 500 GB
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: eip`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `vpc_bandwidth`. |
| `options.bandwidth_mbps` | `number / unit` | `1..2000` (step 1) when `^19_(s?|(youxuan)?)bgp(-.*-los1a)?$`<br>`5..2000` (step 1) when `^19_share$`<br>`1..99 calc_29_` (step 1) when `^19_share$`<br>`1..9999` (step 1) when `^12_(s?|(youxuan)?)bgp(-.*-los1a)?$`<br>`1..9999` (step 1) when `^12_(s?|(youxuan)?)bgp(-.*-los1a)?$`<br>`300..2000` (step 1) | **Bandwidth**. Maps to portal control `calculator_eip_radio_Stepper_0`. |
| `options.ip_quantity` | `number / unit` | `1..99  ` (step 1) | **EIP Quantity**. Maps to portal control `calculator_ipQuantity_stepper_Stepper_0`. |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).
- Traffic-only cards (`ip_reservation: false`): the page always adds the public IP line, so they are rejected.
- Not built: bandwidth-billed EIPs, shared bandwidth and the other product types (`dataInfo_4_`, `_13_`, `_36_`), and the yearly/monthly (PERIOD) EIP.

---

## Portal Control Schema (`autocalc://schema/eip`)

Source file: `src/schema/files/eip.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_eip_radio_type_shareType` | Product Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_eip_radio_type_eipSpec` | Routing Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_eip_radio_eipType` | Billed By | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_eip_radio_Stepper_0` | Bandwidth | `base-stepper` | `1..2000` (step 1) when `^19_(s?|(youxuan)?)bgp(-.*-los1a)?$`<br>`5..2000` (step 1) when `^19_share$`<br>`1..99 calc_29_` (step 1) when `^19_share$`<br>`1..9999` (step 1) when `^12_(s?|(youxuan)?)bgp(-.*-los1a)?$`<br>`1..9999` (step 1) when `^12_(s?|(youxuan)?)bgp(-.*-los1a)?$`<br>`300..2000` (step 1) | Mapped → `bandwidth_mbps` |
| `calculator_ipQuantity_stepper_Stepper_0` | EIP Quantity | `base-stepper` | `1..99  ` (step 1) | Mapped → `ip_quantity` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

## Live Compatibility Replay

Source: `docs/compat/eip.md` (eip compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `reserved` | `ok` | `ok` | — |
| `traffic-700` | `ok` | `ok` | — |
| `reserved-traffic` | `ok` | `ok` | — |
