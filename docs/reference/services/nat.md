# `nat` — NAT Gateway

| Property | Value |
| :--- | :--- |
| **Service Code** | `nat` |
| **Category** | Networking & Edge |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand`, `monthly`, `yearly` |
| **Primary Catalog Group** | `natgateway_natgateway` |
| **Schema Coverage** | 6 controls (4 mapped, 2 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-nat
  customer: Example Corp
  title_prefix: "Example NAT"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: egress-nat-gateway
    environment: prod
    service: nat
    billing: ondemand
    options:
      size: L
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: nat`, `region`, `billing` (`ondemand` | `monthly` | `yearly`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` / `options.size` | `string` | Catalog SKU | Resolved catalog specification code (group `natgateway_natgateway`). Can also be selected via `needs:`. |
| `options.size` | `string` | Catalog / Enum | **Type**. Maps to portal control `calculator_nat_radio_type`. |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).
- **Anti-Splitting Invariant (`FIXED_BASE_COST_SERVICES`)**: Carries a baseline instance or cluster fee. The compiler never splits this resource across multiple cards.

---

## Portal Control Schema (`autocalc://schema/nat`)

Source file: `src/schema/files/nat.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_nat_type_nattype` | Gateway | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (fixed to public NAT gateway by the builder) |
| `calculator_nat_radio_type` | Type | `base-select` | Catalog / Enum | Mapped → `size` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

## Live Compatibility Replay

Source: `docs/compat/nat.md` (nat compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-small` | `ok` | `ok` | — |
| `ondemand-middle` | `ok` | `ok` | — |
| `ondemand-large` | `ok` | `ok` | — |
| `ondemand-xlarge` | `ok` | `ok` | — |
| `monthly-small` | `ok` | `ok` | — |
| `yearly-large` | `ok` | `ok` | — |
