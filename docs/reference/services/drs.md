# `drs` — Data Replication Service

| Property | Value |
| :--- | :--- |
| **Service Code** | `drs` |
| **Category** | Databases & Cache |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `drs_drs.vm` |
| **Schema Coverage** | 8 controls (7 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

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

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example DRS"
    settlement: total
    cards:
      - id: db-sync
        service: drs
        region: sa-brazil-1
        billing: ondemand
        spec: drs.xlg.sync
        options:
          type: sync
          flow: into_cloud
          specification: large
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: drs`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `drs_drs.vm`. |
| `options.type` | `string` | Catalog / Enum | Replication task category: `migration` (Real-time Migration), `sync` (Real-time Sync), or `dr` (Disaster Recovery). *(Portal controls: `calculator_drsvm_radio_drsType`)* |
| `options.flow` | `string` | Catalog / Enum | Data movement direction: `into_cloud` (inbound), `out_of_cloud` (egress), or `in_cloud` (inter-VPC). Alias: `direction`. *(Portal controls: `calculator_drsvm_radio_flowInout`)* |
| `options.specification` | `string` | Catalog / Enum | Task worker scale: `micro`, `small`, `medium`, `large`, or `xlarge`. Alias: `scale`. *(Portal controls: `calculator_drsvm_radio_specificationType`)* |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `type` (from SKU `drsType`), `flow` (from SKU `flowInout`), `specification` (from SKU `specificationType`).

---

??? note "Portal Control Schema (autocalc://schema/drs) — 8 controls"

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

???+ check "Live Compatibility Replay (sa-brazil-1) — 3 scenarios passing"

    Source: `docs/compat/drs.md` (drs compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `ondemand-sync` | `ok` | `ok` | — |
    | `monthly-dr` | `ok` | `ok` | — |
    | `yearly-dr` | `ok` | `ok` | — |
