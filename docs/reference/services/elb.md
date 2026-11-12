# `elb` — Elastic Load Balance

| Property | Value |
| :--- | :--- |
| **Service Code** | `elb` |
| **Category** | Networking & Edge |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand`, `monthly`, `yearly` |
| **Primary Catalog Group** | `elb_elbv2` |
| **Schema Coverage** | 14 controls (8 mapped, 6 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-elb
      customer: Example Corp
      title_prefix: "Example ELB"
    defaults:
      region: sa-brazil-1
      billing: ondemand
    resources:
      - id: public-ingress-elb
        environment: prod
        service: elb
        billing: ondemand
        options:
          network_type: Public network
          billing_mode: traffic
          public_ip_count: 1
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example ELB"
    settlement: total
    cards:
      - id: shared-load-balancer
        service: elb
        region: sa-brazil-1
        billing: ondemand
        options:
          public_ip_count: 1
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: elb`, `region`, `billing` (`ondemand` | `monthly` | `yearly`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `elb_elbv2`. |
| `options.type` | `string` | Catalog / Enum | **Type**. Maps to portal control `calculator_elb_type_elbType`. |
| `options.az_type` | `string` | Catalog / Enum | **Sub-AZ**. Maps to portal control `calculator_elb_type_spec_azType`. |
| `options.protocol` | `string` | Catalog / Enum | **Load Balancing Type**. Maps to portal control `calculator_flavor_checkboxGroup_flavorType`. |
| `options.l4_lcu` | `number / unit` | Default `1 LCU` | **LCUs (Network Load Balancing)**. Maps to portal control `calculator_lcu_network_Stepper_0`. |
| `options.public_ip_count` | `number / unit` | `1..2 PCS` (step 1) | Load balancer network type selector: `1` = Public Network (Internet-facing with dynamic BGP EIP), `2` = Private Network (internal VPC). In declarative quotes, write `network_type: public` or `public: true`. *(Portal controls: `calculator_ip_Stepper_0`)* |
| `options.hours` | `number / unit` | `1..9999 hour` (step 1) | Operating duration in hours (default: 730). *(Portal controls: `global_ONDEMANDTIME_Stepper_0`)* |
| `options.flavor` | `any` | Builder-validated | Builder option `flavor`. |
| `options.l7_lcu` | `any` | Builder-validated | Builder option `l7_lcu`. |
| `options.lcu` | `any` | Builder-validated | Builder option `lcu`. |
| `options.spec` | `any` | Builder-validated | Builder option `spec`. |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).
- **Anti-Splitting Invariant (`FIXED_BASE_COST_SERVICES`)**: Carries a baseline instance or cluster fee. The compiler never splits this resource across multiple cards.
- **Dedicated load balancers are built** (`elbv3.*`, LCU billing). Request one with `options.type: dedicated` (or an `elbv3.*` `spec` / `flavor`; the default flavor is `elbv3.professional`). It is pay-per-use only (`billing: ondemand`). Set `options.protocol` to `tcp`, `udp` or `tls` (default `tcp`), and size the traffic with `options.l7_lcu` (application LCUs) and/or `options.l4_lcu` (network LCUs, alias `lcu`). `options.az_type` defaults to `single`; multi-zone (`az_type: multi`) is rejected in `sa-brazil-1` and `la-south-2`, where the calculator does not offer it. Without `type: dedicated` the card resolves to the shared `elbv2.basic.default`.

    ```yaml
    resources:
      - id: prod-alb
        service: elb
        billing: ondemand
        options: { type: dedicated, protocol: tls, l7_lcu: 10, l4_lcu: 5 }
    ```

---

??? note "Portal Control Schema (autocalc://schema/elb) — 14 controls"

    Source file: `src/schema/files/elb.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_elb_type_elbType` | Type | `base-radio-group` | Catalog / Enum | Mapped → `type` |
    | `calculator_elb_type_spec_azType` | Sub-AZ | `base-radio-group` | Catalog / Enum | Mapped → `az_type` |
    | `calculator_elb_type_spec_flavorCatagory` | Specifications | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (dedicated ELB control not used by shared ELB builder) |
    | `calculator_flavor_checkboxGroup_flavorType` | Load Balancing Type | `base-checkbox-group` | Catalog / Enum | Mapped → `protocol` |
    | `calculator_tcp_new_connections_Stepper_0` | New Connections | `base-stepper` | `0..99999999` (step 1) | Fixed / Unsupported (dedicated ELB LCU metric not used by shared ELB builder) |
    | `calculator_tcp_max_concurrent_connections_Stepper_0` | Maximum Concurrent Connections | `base-stepper` | `0..99999999` (step 1) | Fixed / Unsupported (dedicated ELB LCU metric not used by shared ELB builder) |
    | `calculator_tcp_data_switch_UNSET_Switch` | — | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (dedicated ELB LCU metric not used by shared ELB builder) |
    | `calculator_tcp_flow_Stepper_0` | Processed Bytes | `base-stepper` | `0..99999999 GB/hour` (step 1)<br>`0..99999999 GB/day` (step 1)<br>`0..99999999 GB/month` (step 1) | Fixed / Unsupported (dedicated ELB LCU metric not used by shared ELB builder) |
    | `calculator_lcu_network_Stepper_0` | LCUs (Network Load Balancing) | `base-stepper` | Default `1 LCU` | Mapped → `l4_lcu` |
    | `calculator_ip_Stepper_0` | Network Type | `base-radio-stepper` | `1..2 PCS` (step 1) | Mapped → `public_ip_count` |
    | `global_ONDEMANDTIME_Stepper_0` | Required Duration | `base-stepper` | `1..9999 hour` (step 1) | Mapped → `hours` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 4 scenarios passing"

    Source: `docs/compat/elb.md` (elb compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `default` | `ok` | `ok` | — |
    | `ips-1` | `ok` | `ok` | — |
    | `monthly` | `ok` | `ok` | — |
    | `yearly` | `ok` | `ok` | — |
