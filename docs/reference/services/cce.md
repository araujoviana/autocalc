# `cce` — Cloud Container Engine

| Property | Value |
| :--- | :--- |
| **Service Code** | `cce` |
| **Category** | Containers |
| **Publish Gate Status** | <span class="badge badge--verified">VERIFIED</span> (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand`, `monthly`, `yearly` |
| **Primary Catalog Group** | `cce_cce.cluster` |
| **Schema Coverage** | 9 controls (7 mapped, 2 intentionally fixed/unsupported) |

---

## Example Usage

=== "Declarative Quote (`version: '1'`)"

    ```yaml
    version: "1"
    metadata:
      id: example-cce
      customer: Example Corp
      title_prefix: "Example CCE"
    defaults:
      region: sa-brazil-1
      billing: ondemand
    resources:
      - id: game-tick-cce-cluster
        environment: latam_south
        service: cce
        billing: ondemand
        options:
          scale: 200nodes
          master_az: 3AZ
    ```

=== "Plain Card (`cards:`)"

    ```yaml
    customer: Example Corp
    name: "Example CCE"
    settlement: total
    cards:
      - id: k8s-cluster
        service: cce
        region: sa-brazil-1
        billing: monthly
        options:
          cluster_type: standard
          ha: true
          scale: small
    ```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: cce`, `region`, `billing` (`ondemand` | `monthly` | `yearly`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` | `string` | Catalog SKU | Catalog specification code in group `cce_cce.cluster`. |
| `options.cluster_type` | `string` | Catalog / Enum | Cluster edition (`standard`). CCE Turbo is currently blocked pending verification. *(Portal controls: `calculator_clustertype_radio_clusterType`)* |
| `options.scale` | `string` | Catalog / Enum | Maximum worker node scale (`small` = 50 nodes, `medium` = 200 nodes, `large` = 1000 nodes, `xlarge` = 2000 nodes). Accepts `50nodes`, `200nodes`, `1000nodes`, `2000nodes`. *(Portal controls: `calculator_clustertype_radio_clusterNodeScale`)* |
| `options.ha` | `string` | Catalog / Enum | High-availability multi-master control plane (`true` selects `cce.s2.*` multi-master, `false` selects `cce.s1.*` single-master). Alias: `control_plane_ha: true` or `master_az: 3AZ`. *(Portal controls: `calculator_clustertype_radio_clusterMasterScale`)* |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- **Anti-Splitting Invariant (`FIXED_BASE_COST_SERVICES`)**: Carries a baseline instance or cluster fee. The compiler never splits this resource across multiple cards.

---

??? note "Portal Control Schema (autocalc://schema/cce) — 9 controls"

    Source file: `src/schema/files/cce.yaml`
    
    | Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
    | `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
    | `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
    | `calculator_clustertype_radio_productType` | Product Category | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (fixed to standard CCE cluster category by the builder) |
    | `calculator_clustertype_radio_clusterType` | Cluster Type | `base-radio-group` | Catalog / Enum | Mapped → `cluster_type` |
    | `calculator_clustertype_radio_clusterNodeScale` | Cluster Scale | `base-radio-group` | Catalog / Enum | Mapped → `scale` |
    | `calculator_clustertype_radio_clusterMasterScale` | Master Nodes | `base-radio-group` | Catalog / Enum | Mapped → `ha` |
    | `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |
    | `global_QUANTITY_Stepper_0` | Quantity | `base-stepper` | `1..999 PCS` (step 1) | Mapped → `quantity` |

---

???+ check "Live Compatibility Replay (sa-brazil-1) — 4 scenarios passing"

    Source: `docs/compat/cce.md` (cce compatibility (sa-brazil-1, 2026-11-07))
    
    | Scenario | Replay Result | Stage | Detail |
    | :--- | :--- | :--- | :--- |
    | `ondemand-ha-small` | `ok` | `ok` | — |
    | `monthly-ha-small` | `ok` | `ok` | — |
    | `yearly-ha-small` | `ok` | `ok` | — |
    | `ondemand-single-medium` | `ok` | `ok` | — |
