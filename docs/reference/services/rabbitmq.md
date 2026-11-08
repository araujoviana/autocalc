# `rabbitmq` — DMS (for RabbitMQ)

| Property | Value |
| :--- | :--- |
| **Service Code** | `rabbitmq` (aliases: `dms-rabbitmq`) |
| **Category** | Middleware & Messaging |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `dms_dms.platinum` |
| **Schema Coverage** | 11 controls (8 mapped, 3 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-rabbitmq
      customer: Example Corp
      title_prefix: "Example RABBITMQ"
    defaults:
      region: sa-brazil-1
      billing: monthly
    resources:
      - id: command-dispatch-rabbitmq
        environment: carajas_hub
        service: rabbitmq
        billing: monthly
        options:
          flavor: rabbitmq.2u4g.cluster
          brokers: 3
          storage_type: ultra-high-io
          storage_gb: 300 GB
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example RABBITMQ"
    settlement: total
    cards:
      - id: task-queue
        service: rabbitmq
        region: sa-brazil-1
        billing: monthly
        options:
          spec_id: c6.2u4g.single
          brokers: 1
          storage_gb: 100
          version: "3.8"
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: rabbitmq`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `dms_dms.platinum`. |
| `options.version` | `string` | Catalog / Enum | RabbitMQ engine version (default: `3.8`). Alias: `engine_version`. *(Portal controls: `calculator_rabbitMQ_version_switch_UNSET_Switch`)* |
| `options.spec_id` | `string` | Catalog / Enum | Broker flavor (`c6.2u4g.single`..`c6.24u48g.single` or `c6.2u4g.cluster`..`c6.32u64g.cluster`). Can also be passed as `flavor`. *(Portal controls: `calculator_rabbitMQ_architecture_switch_architectureName`, `calculator_rabbitMQ_specType_switch_specName`)* |
| `options.storage_gb` | `number / unit` | `100..30000` (step 100) | Broker disk storage per node in GB (≥ 100 GB). Total cluster storage equals `storage_gb * brokers`. *(Portal controls: `calculator_rabbitMQ_new_storage_stepper_Stepper_0`)* |
| `options.brokers` | `any` | Builder-validated | Broker node count: `1` for single-node; `3`, `5`, or `7` for cluster. |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.

---

??? note "Portal Control Schema (autocalc://schema/rabbitmq) — 11 controls"

    Source file: `src/schema/files/rabbitmq.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_rabbitMQ_version_switch_UNSET_Switch` | Version | `base-radio-group` | Catalog / Enum | Mapped → `version` |
    | `calculator_rabbitMQ_instanceType_switch_instanceType` | Instance Type | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (fixed to professional edition by the builder) |
    | `calculator_rabbitMQ_architecture_switch_architectureName` | Architecture | `base-radio-group` | Catalog / Enum | Mapped → `spec_id` |
    | `calculator_rabbitMQ_specType_switch_specName` | Flavor | `base-radio-group` | Catalog / Enum | Mapped → `spec_id` |
    | `calculator_rabbitMQ_new_storage_stepper_storageType` | Storage Space | `base-select` | Catalog / Enum | Fixed / Unsupported (fixed to ultra-high I/O storage by the builder) |
    | `calculator_rabbitMQ_new_storage_stepper_Stepper_0` | — | `base-stepper` | `100..30000` (step 100) | Mapped → `storage_gb` |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
    | `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..999 instance` (step 1) | Mapped → `quantity` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 3 scenarios passing"

    Source: `docs/compat/rabbitmq.md` (rabbitmq compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `ondemand-single` | `ok` | `ok` | — |
    | `monthly-cluster` | `ok` | `ok` | — |
    | `yearly-cluster` | `ok` | `ok` | — |
