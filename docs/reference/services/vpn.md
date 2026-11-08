# `vpn` — Virtual Private Network

| Property | Value |
| :--- | :--- |
| **Service Code** | `vpn` |
| **Category** | Networking & Edge |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `vpc_bandwidth` |
| **Schema Coverage** | 13 controls (7 mapped, 6 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-vpn
  customer: Example Corp
  title_prefix: "Example VPN"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: clinic-site-vpn
    environment: prod
    service: vpn
    billing: monthly
    options:
      mode: Vpn
      network_type: Public network
      spec: Professional2
      shared_bandwidth_mbps: 50 Mbps
      connection_groups: 10
```

### Plain Card (`cards:`)

```yaml
customer: Example Corp
name: "Example VPN"
settlement: total
cards:
  - id: ipsec-vpn
    service: vpn
    region: sa-brazil-1
    billing: monthly
    options:
      eip1_mbps: 10
      eip2_mbps: 10
      connection_groups: 10
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: vpn`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `vpc_bandwidth`. |
| `options.spec` | `string` | Catalog / Enum | VPN gateway specification (`Basic`, `Professional1`, `Professional2`). *(Portal controls: `calculator_evpnGatewaySpec_radio_calGatewaySpec`)* |
| `options.connection_groups` | `number / unit` | Default `10` when `S2C-VPN-Ent.Basic`<br>`10..100` (step 1) when `V300||V1G||S2C-VPN-Ent.GM`<br>`1..10` (step 1) when `S2C-VPN-Ent.Basic`<br>`1..100` (step 1) when `V300||V1G||S2C-VPN-Ent.GM` | Number of IPsec VPN connection groups (default: 10; max 100). Alias: `connections`. *(Portal controls: `calculator_evpnGatewaySpec_radio_Stepper_1`)* |
| `options.eip1_mbps` | `number / unit` | `1..300 Mbit/s` (step 1) | Primary active tunnel EIP bandwidth in Mbit/s (1–300 Mbit/s). In declarative quotes, write `bandwidth: 20 Mbps` (sets both tunnels). *(Portal controls: `calculator_evpnEip1_stepper_Stepper_0`)* |
| `options.eip2_mbps` | `number / unit` | `1..300 Mbit/s` (step 1) | Secondary active tunnel EIP bandwidth in Mbit/s (1–300 Mbit/s). *(Portal controls: `calculator_evpnEip2_stepper_Stepper_0`)* |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).
- **Anti-Splitting Invariant (`FIXED_BASE_COST_SERVICES`)**: Carries a baseline instance or cluster fee. The compiler never splits this resource across multiple cards.

---

## Portal Control Schema (`autocalc://schema/vpn`)

Source file: `src/schema/files/vpn.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_gatewayType_radio_gatewayType` | VPN Edition | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_gatewayMode_radio_gatewayMode` | Mode | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_evpnNetworkType_switch_UNSET_Switch` | Network Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_evpnGatewaySpec_radio_calGatewaySpec` | Specification | `base-radio-group` | Catalog / Enum | Mapped → `spec` |
| `calculator_evpnGatewaySpec_radio_calNonFixedIP` | Access via Non-fixed IP Addresses | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_evpnGatewaySpec_radio_Stepper_1` | VPN Connection Groups | `base-radio-stepper` | Default `10` when `S2C-VPN-Ent.Basic`<br>`10..100` (step 1) when `V300||V1G||S2C-VPN-Ent.GM`<br>`1..10` (step 1) when `S2C-VPN-Ent.Basic`<br>`1..100` (step 1) when `V300||V1G||S2C-VPN-Ent.GM` | Mapped → `connection_groups` |
| `calculator_evpnShareBandwidth_switch_UNSET_Switch` | Using Shared Bandwidth | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `calculator_evpnEip1_stepper_Stepper_0` | EIP 1 Bandwidth | `base-stepper` | `1..300 Mbit/s` (step 1) | Mapped → `eip1_mbps` |
| `calculator_evpnEip2_stepper_Stepper_0` | EIP 2 Bandwidth | `base-stepper` | `1..300 Mbit/s` (step 1) | Mapped → `eip2_mbps` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

## Live Compatibility Replay

Source: `docs/compat/vpn.md` (vpn compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `monthly-1000` | `ok` | `ok` | — |
| `yearly-1000` | `ok` | `ok` | — |
| `ondemand-1000` | `ok` | `ok` | — |
