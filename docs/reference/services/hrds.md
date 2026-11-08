# `hrds` — Dedicated RDS

| Property | Value |
| :--- | :--- |
| **Service Code** | `hrds` |
| **Category** | Databases & Cache |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly` |
| **Primary Catalog Group** | `rds_rds.vm` |
| **Schema Coverage** | 12 controls (9 mapped, 3 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-hrds
      customer: Example Corp
      title_prefix: "Example HRDS"
    defaults:
      region: sa-brazil-1
      billing: monthly
    resources:
      - id: erp-dedicated-hrds
        environment: prod
        service: hrds
        billing: monthly
        needs:
          engine: mysql
          vcpus: 4
          memory: 8 GiB
        options:
          storage_gb: 300 GB
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example HRDS"
    settlement: total
    cards:
      - id: dedicated-mysql
        service: hrds
        region: sa-brazil-1
        billing: monthly
        spec: rds.mysql.y1.large.2.ha
        options:
          db_type: mysql
          storage_gb: 120
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: hrds`, `region`, `billing` (`monthly` | `yearly`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `rds_rds.vm`. |
| `options.db_type` | `string` | Catalog / Enum | Relational database engine: `mysql`, `postgresql`, or `sqlserver`. In declarative quotes, write `needs: { engine: mysql }`. *(Portal controls: `calculator_rdsvm_radio_dbType`)* |
| `options.db_version` | `string` | Catalog / Enum | Database engine version (e.g. `8.0` for MySQL, `14` for PostgreSQL). Alias: `version`. *(Portal controls: `calculator_rdsvm_radio_dbVersion`)* |
| `options.instance_type` | `string` | Catalog / Enum | Dedicated instance topology: `ha` (Primary/Standby) or `single`. *(Portal controls: `calculator_rdsvm_radio_instanceType`)* |
| `options.spec` | `string` | Catalog / Enum | Dedicated RDS y1 family SKU (e.g. `rds.mysql.y1.large.2.ha`). *(Portal controls: `calculator_rdsvm_radio2_spec`)* |
| `options.storage_gb` | `number / unit` | Default `120` | Dedicated database disk capacity in GB (120–4,000 GB, in 10 GB increments). *(Portal controls: `calculator_rdsvolume_stepper_Stepper_0`)* |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `spec` (from SKU `spec`).
- **Spec Rule**: Dedicated RDS (`hrds`) requires a `y1` family specification (`rds.<engine>.y1.*`).

---

??? note "Portal Control Schema (autocalc://schema/hrds) — 12 controls"

    Source file: `src/schema/files/hrds.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_rdsvm_radio_dbType` | DB Engine | `base-radio-group` | Catalog / Enum | Mapped → `db_type` |
    | `calculator_rdsvm_radio_dbVersion` | DB Engine Version | `base-radio-group` | Catalog / Enum | Mapped → `db_version` |
    | `calculator_rdsvm_radio_instanceType` | DB Instance Type | `base-radio-group` | Catalog / Enum | Mapped → `instance_type` |
    | `calculator_rdsvm_radio_publicType` | DB Instance Class | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `calculator_rdsvm_radio2_spec` | — | `base-select` | Catalog / Enum | Mapped → `spec` |
    | `calculator_rdsvolume_stepper_type` | Storage | `base-select` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `calculator_rdsvolume_stepper_Stepper_0` | — | `base-stepper` | Default `120` | Mapped → `storage_gb` |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
    | `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..50 PCS` (step 1) | Mapped → `quantity` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 2 scenarios passing"

    Source: `docs/compat/hrds.md` (hrds compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `monthly-mysql-y1-ha` | `ok` | `ok` | — |
    | `yearly-mysql-y1-ha` | `ok` | `ok` | — |
