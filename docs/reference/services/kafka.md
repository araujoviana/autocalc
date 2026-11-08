# `kafka` — DMS (for Kafka)

| Property | Value |
| :--- | :--- |
| **Service Code** | `kafka` (aliases: `dmq`, `dms-kafka`) |
| **Category** | Middleware & Messaging |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly`, `ondemand` |
| **Primary Catalog Group** | `dms_dms.platinum` |
| **Schema Coverage** | 10 controls (8 mapped, 2 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-kafka
  customer: Example Corp
  title_prefix: "Example KAFKA"
defaults:
  region: sa-brazil-1
  billing: monthly
resources:
  - id: payment-event-kafka
    environment: prod
    service: kafka
    billing: ondemand
    options:
      flavor: kafka.2u4g.cluster.small
      brokers: 3
      storage_type: ultra-high-io
      storage_gb: 300 GB
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: kafka`, `region`, `billing` (`monthly` | `yearly` | `ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `dms_dms.platinum`. |
| `options.spec_id` | `string` | Catalog / Enum | Broker flavor (`kafka.2u4g.single.small`, `c6.2u4g.cluster`, `c6.4u8g.cluster`, `c6.8u16g.cluster`, `c6.12u24g.cluster`, `c6.16u32g.cluster`). *(Portal controls: `calculator_kafka_architecture_switch_architectureName`, `calculator_kafka_specType_switch_specName`)* |
| `options.brokers` | `number / unit` | Default `1 PCS` | Broker count (`1` for single-node, `≥ 3` for cluster). *(Portal controls: `calculator_kafka_node_num_stepper_Stepper_0`)* |
| `options.storage_gb` | `number / unit` | `100..10000` (step 100) | Total broker disk storage in GB (≥ 100 GB). *(Portal controls: `calculator_kafka_new_storage_stepper_Stepper_0`)* |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **Known Vendor Portal Defect (`GH-6-KAFKA-YEARLY-EDIT` on `yearly`)**: DMS Kafka yearly cards re-price on Edit with 'No data matched' error due to vendor SPA catalog key mismatch. *(Vendor calculator SPA re-prices Kafka yearly cards on Edit. Official CBC rating API price was verified and preserved.)*

---

## Portal Control Schema (`autocalc://schema/kafka`)

Source file: `src/schema/files/kafka.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_kafka_architecture_switch_architectureName` | Architecture | `base-radio-group` | Catalog / Enum | Mapped → `spec_id` |
| `calculator_kafka_specType_switch_specName` | Flavor | `base-radio-group` | Catalog / Enum | Mapped → `spec_id` |
| `calculator_kafka_node_num_stepper_Stepper_0` | Brokers | `base-stepper` | Default `1 PCS` | Mapped → `brokers` |
| `calculator_kafka_new_storage_stepper_storageType` | Storage Space per Broker | `base-select` | Catalog / Enum | Fixed / Unsupported (fixed to ultra-high I/O storage by the builder) |
| `calculator_kafka_new_storage_stepper_Stepper_0` | — | `base-stepper` | `100..10000` (step 100) | Mapped → `storage_gb` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..999 instance` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/kafka.md` (kafka compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-single-small` | `ok` | `ok` | — |
| `monthly-cluster-c6` | `ok` | `ok` | — |
| `yearly-cluster-c6` | `ok` | `ok` | — |
