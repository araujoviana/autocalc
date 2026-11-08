# `memcached` — Distributed Cache Service (Memcached)

| Property | Value |
| :--- | :--- |
| **Service Code** | `memcached` |
| **Category** | Databases & Cache |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand` |
| **Primary Catalog Group** | `dcs_dcs.memcached` |
| **Schema Coverage** | 7 controls (6 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-memcached
  customer: Example Corp
  title_prefix: "Example MEMCACHED"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: bi-query-cache-memcached
    environment: analytics
    service: memcached
    billing: ondemand
    options:
      instance_type: Master/Standby
      capacity_gb: 8 GB
```

### Plain Card (`cards:`)

```yaml
customer: Example Corp
name: "Example MEMCACHED"
settlement: total
cards:
  - id: session-cache
    service: memcached
    region: sa-brazil-1
    billing: ondemand
    options:
      instance_type: single_node
      memory_gb: 4
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: memcached`, `region`, `billing` (`ondemand`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `dcs_dcs.memcached`. |
| `options.instance_type` | `string` | Catalog / Enum | Cache topology: `single_node` or `master_standby` (High Availability). In declarative quotes, write `topology: master-standby`. *(Portal controls: `calculator_memcached_version_instance_type`)* |
| `options.memory_gb` | `number / unit` | `2..9999` (step 1) | Cache memory capacity in GB (minimum 2 GB). Alias: `capacity_gb`. *(Portal controls: `calculator_memcached_version_Stepper_0`)* |
| `options.hours` | `number / unit` | `1..9999 hour` (step 1) | **Required Duration**. Maps to portal control `global_ONDEMANDTIME_Stepper_0`. |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **Usage-Priced (`USAGE_PRICED`)**: Pay-per-use SKUs carry usage plans rather than a flat catalog list price; `plan-quote` resolves the SKU, and exact usage rating runs during `apply-quote` / `quote`.
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `instance_type` (from SKU `instance_type`).

---

## Portal Control Schema (`autocalc://schema/memcached`)

Source file: `src/schema/files/memcached.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_memcached_version_instance_type` | Instance Type | `base-radio-group` | Catalog / Enum | Mapped → `instance_type` |
| `calculator_memcached_version_Stepper_0` | Specification | `base-radio-stepper` | `2..9999` (step 1) | Mapped → `memory_gb` |
| `global_ONDEMANDTIME_Stepper_0` | Required Duration | `base-stepper` | `1..9999 hour` (step 1) | Mapped → `hours` |
| `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..500 instance` (step 1) | Mapped → `quantity` |

---

## Live Compatibility Replay

Source: `docs/compat/memcached.md` (memcached compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `ondemand-single-8gb` | `ok` | `ok` | — |
| `ondemand-ha-16gb` | `ok` | `ok` | — |
