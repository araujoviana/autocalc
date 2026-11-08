# `dline` — Cloud Connect / Direct Connect As A Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `dline` (aliases: `dc`, `direct-connect`, `direct_connect`) |
| **Category** | Networking & Edge |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly` |
| **Primary Catalog Group** | `dcaas_dcaas.port` |
| **Schema Coverage** | 6 controls (5 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-dline
  customer: Example Corp
  title_prefix: "Example DLINE"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: rsfn-direct-connect
    environment: prod
    service: dline
    billing: monthly
    options:
      port: 1G
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: dline`, `region`, `billing` (`monthly` | `yearly`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` / `options.port` | `string` | Catalog SKU | Resolved catalog specification code (group `dcaas_dcaas.port`). Can also be selected via `needs:`. |
| `options.port` | `string` | Catalog / Enum | **Port Speed**. Maps to portal control `calculator_dline_radio_portType`. |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **Anti-Splitting Invariant (`FIXED_BASE_COST_SERVICES`)**: Carries a baseline instance or cluster fee. The compiler never splits this resource across multiple cards.

---

## Portal Control Schema (`autocalc://schema/dline`)

Source file: `src/schema/files/dline.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_dline_radio_portType` | Port Speed | `base-radio-group` | Catalog / Enum | Mapped → `port` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..9999 port` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/dline.md` (dline compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `monthly-1ge` | `ok` | `ok` | — |
| `yearly-1ge` | `ok` | `ok` | — |
| `monthly-10ge` | `ok` | `ok` | — |
| `yearly-10ge` | `ok` | `ok` | — |
| `monthly-40ge` | `ok` | `ok` | — |
| `yearly-40ge` | `ok` | `ok` | — |
| `monthly-100ge` | `ok` | `ok` | — |
| `yearly-100ge` | `ok` | `ok` | — |
