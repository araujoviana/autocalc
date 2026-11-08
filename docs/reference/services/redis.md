# `redis` — Distributed Cache Service (Redis)

| Property | Value |
| :--- | :--- |
| **Service Code** | `redis` (aliases: `dcs`) |
| **Category** | Databases & Cache |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `monthly`, `yearly` |
| **Primary Catalog Group** | `dcs_dcs3` |
| **Schema Coverage** | 10 controls (9 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-redis
      customer: Example Corp
      title_prefix: "Example REDIS"
    defaults:
      region: sa-brazil-1
      billing: monthly
    resources:
      - id: cart-session-redis
        environment: prod
        service: redis
        billing: monthly
        options:
          version: "6.0"
          instance_type: Master/Standby
          architecture: x86
          replicas: 2
          capacity_gb: 16 GB
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example REDIS"
    settlement: total
    cards:
      - id: cache-cluster
        service: redis
        region: sa-brazil-1
        billing: monthly
        spec: redis.ha.xu1.large.r2.8
        options:
          instances: 1
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: redis`, `region`, `billing` (`monthly` | `yearly`), `quantity` (fixed to `1`), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `dcs_dcs3`. |
| `options.edition` | `string` | Catalog / Enum | **Edition**. Maps to portal control `calculator_redis_version_edition`. |
| `options.version` | `string` | Catalog / Enum | **Version**. Maps to portal control `calculator_redis_version_version`. |
| `options.instance_type` | `string` | Catalog / Enum | **Instance Type**. Maps to portal control `calculator_redis_version_instance_type`. |
| `options.cpu_storage` | `string` | Catalog / Enum | **CPU | Memory**. Maps to portal control `calculator_redis_version_cpu_storage`. |
| `options.spec` | `string` | Catalog / Enum | **Specification**. Maps to portal control `calculator_redis_version_spec`. |
| `options.instances` | `number / unit` | `1..100 instance` (step 1) | **Quantity**. Maps to portal control `calculator_redis_quantity_Stepper_0`. |

---

## Behavioral Rules & Constraints

- **Single-Quantity Form**: The calculator form for this service has no global quantity stepper (`quantity` must be `1`, or use service-specific instance/node/key counts).
- **SKU-to-Control Projection**: The resolved catalog SKU populates form controls: `instance_type`, `version`, `edition`, `cpu_storage`, `spec`.

---

??? note "Portal Control Schema (autocalc://schema/redis) — 10 controls"

    Source file: `src/schema/files/redis.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (not in the recipe; the page default is kept) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_redis_version_edition` | Edition | `base-radio-group` | Catalog / Enum | Mapped → `edition` |
    | `calculator_redis_version_version` | Version | `base-radio-group` | Catalog / Enum | Mapped → `version` |
    | `calculator_redis_version_instance_type` | Instance Type | `base-radio-group` | Catalog / Enum | Mapped → `instance_type` |
    | `calculator_redis_version_cpu_storage` | CPU | Memory | `base-radio-group` | Catalog / Enum | Mapped → `cpu_storage` |
    | `calculator_redis_version_spec` | Specification | `base-radio-group` | Catalog / Enum | Mapped → `spec` |
    | `calculator_redis_quantity_Stepper_0` | Quantity | `base-stepper` | `1..100 instance` (step 1) | Mapped → `instances` |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 3 scenarios passing"

    Source: `docs/compat/redis.md` (redis compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `ondemand-single-4g` | `ok` | `ok` | — |
    | `monthly-ha-8g` | `ok` | `ok` | — |
    | `yearly-cluster-16g` | `ok` | `ok` | — |
