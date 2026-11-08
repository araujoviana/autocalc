# `vpcep` — VPC Endpoint

| Property | Value |
| :--- | :--- |
| **Service Code** | `vpcep` |
| **Category** | Networking & Edge |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | `vpc_vpcep` |
| **Schema Coverage** | 5 controls (3 mapped, 2 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-vpcep
      customer: Example Corp
      title_prefix: "Example VPCEP"
    defaults:
      region: sa-brazil-1
      billing: ondemand
    resources:
      - id: private-service-vpcep
        environment: secops
        service: vpcep
        billing: ondemand
        options:
          traffic_gb: 1000 GB
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example VPCEP"
    settlement: total
    cards:
      - id: service-endpoint
        service: vpcep
        region: sa-brazil-1
        billing: ondemand
        options:
          duration_hours: 730
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: vpcep`, `region`, `billing` (`ondemand`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `vpc_vpcep`. |
| `options.duration_hours` | `number / unit` | `1..999999 hour` (step 1) | VPC endpoint instance operating duration in hours (default: 730). In declarative quotes, write `hours: 730` or `endpoints: 2`. *(Portal controls: `calculator_vpcep_time_Stepper_0`)* |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).

---

??? note "Portal Control Schema (autocalc://schema/vpcep) — 5 controls"

    Source file: `src/schema/files/vpcep.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_vpcep_serviceType_serviceType` | Service Category | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `calculator_vpcep_time_Stepper_0` | Purchase Duration | `base-stepper` | `1..999999 hour` (step 1) | Mapped → `duration_hours` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 2 scenarios passing"

    Source: `docs/compat/vpcep.md` (vpcep compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `hours-300` | `ok` | `ok` | — |
    | `hours-730` | `ok` | `ok` | — |
