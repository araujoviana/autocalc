# `cbr` — Cloud Backup and Recovery

| Property | Value |
| :--- | :--- |
| **Service Code** | `cbr` |
| **Category** | Storage & Backup |
| **Publish Gate Status** | `VERIFIED` (Full Publish Gate) |
| **Verified Frontend** | `11.4.201` |
| **Supported Billing Modes** | `ondemand`, `monthly`, `yearly` |
| **Primary Catalog Group** | `cbr_cbr.vault` |
| **Schema Coverage** | 6 controls (5 mapped, 1 intentionally fixed/unsupported) |

---

## Example Usage

### Declarative Quote (`version: "1"`)

```yaml
version: "1"
metadata:
  id: example-cbr
  customer: Example Corp
  title_prefix: "Example CBR"
defaults:
  region: sa-brazil-1
  billing: ondemand
resources:
  - id: hospital-vault-cbr
    environment: prod
    service: cbr
    billing: monthly
    options:
      vault_type: Server
      vault_spec: server.backup
      capacity_gb: 4000 GB
```

### Plain Card (`cards:`)

```yaml
customer: Example Corp
name: "Example CBR"
settlement: total
cards:
  - id: server-backup-vault
    service: cbr
    region: sa-brazil-1
    billing: yearly
    options:
      vault_spec: vault.backup.server.normal
      size_gb: 1000
```

---

## Argument Reference (`needs` & `options`)

Top-level card fields: `id` (required), `service: cbr`, `region`, `billing` (`ondemand` | `monthly` | `yearly`), `quantity` (positive integer), `needs` (for automatic SKU ranking by `vcpus` / `memory_gb`), `spec` (explicit catalog SKU), and `options`.

| Field | Type | Range / Allowed | Description |
| :--- | :--- | :--- | :--- |
| `spec` / `options.vault_spec` | `string` | Catalog SKU | Resolved catalog specification code (group `cbr_cbr.vault`). Can also be selected via `needs:`. |
| `options.vault_spec` | `string` | Catalog / Enum | Backup vault specification SKU (`vault.backup.server.normal`, `vault.backup.server.multiaz`, `vault.backup.volume.normal`, `vault.backup.database.normal`, `vault.backup.turbo.normal`). In declarative quotes, write `vault_type: server` or `vault_type: disk`. *(Portal controls: `calculator_cbr_type_item`)* |
| `options.size_gb` | `number / unit` | `10..10485760` (step 1000) when `vault.(backup|replication).*`<br>`1024..10485760` (step 1024) when `vault.hybrid.*` | Backup vault storage capacity in GB (10–10,485,760 GB). In declarative quotes, write `capacity: "4 TB"`. *(Portal controls: `calculator_cbr_type_Stepper_0`)* |

---

## Behavioral Rules & Constraints

- **Multi-Quantity Form**: Supports `quantity: N` directly on the calculator card.
- Hybrid cloud vaults (`vault.hybrid.*`): the page does not keep the typed capacity (capacity control `calculator_cbr_type_Stepper_0`), so they cannot be encoded.
- Dedicated-cloud (`*.dec.*`) vaults: not built.

---

## Portal Control Schema (`autocalc://schema/cbr`)

Source file: `src/schema/files/cbr.yaml`

| Control ID | Portal Title | Widget Kind | Ranges / Stepping | Mapping Status |
| :--- | :--- | :--- | :--- | :--- |
| `global_REGIONINFO_region` | Region | `base-region` | Catalog / Enum | Mapped → `region` |
| `global_REGIONINFO_locationType` | AZ | `base-radio-group` | Catalog / Enum | Fixed / Unsupported (AZ is left at the page default) |
| `global_REGIONINFO_chargeMode` | Billing Mode | `base-radio-group` | Catalog / Enum | Mapped → `billing` |
| `calculator_cbr_type_item` | Vault Type | `base-select` | Catalog / Enum | Mapped → `vault_spec` |
| `calculator_cbr_type_Stepper_0` | — | `base-stepper` | `10..10485760` (step 1000) when `vault.(backup|replication).*`<br>`1024..10485760` (step 1024) when `vault.hybrid.*` | Mapped → `size_gb` |
| `global_PERIODTIME_UNSET_PeriodTime` | Required Duration | `base-radio-group` | Catalog / Enum | Mapped → `periods` |

---

## Live Compatibility Replay

Source: `docs/compat/cbr.md` (cbr compatibility (sa-brazil-1, 2026-11-07))

| Scenario | Replay Result | Stage | Detail |
| :--- | :--- | :--- | :--- |
| `yearly-server` | `ok` | `ok` | — |
| `monthly-server` | `ok` | `ok` | — |
| `ondemand-server` | `ok` | `ok` | — |
| `database` | `ok` | `ok` | — |
| `volume` | `ok` | `ok` | — |
| `server-multiaz` | `ok` | `ok` | — |
| `turbo` | `ok` | `ok` | — |
| `database-multiaz` | `ok` | `ok` | — |
| `workspace` | `ok` | `ok` | — |
| `replication` | `ok` | `ok` | — |
