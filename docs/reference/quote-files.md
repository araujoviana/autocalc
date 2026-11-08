# Quote files, declarative language, and card schemas

Status: accepted ([ADR-0018](../adr/0018-declarative-quotes-and-generated-card-schema.md)).

`autocalc` accepts two YAML quote file formats:
1. **Declarative Quote (`version: "1"`)** — Full infrastructure-as-code specification with mandatory physical units, reusable machine templates, multi-environment defaults, financial horizon evaluation, automatic stepper splitting, and deterministic `quote.lock.yaml` output.
2. **Plain Card File (`cards:`)** — Direct list of cards mapped to service options, producing a `quote.lock.json` file.

For service-specific arguments (`needs`, `spec`, `options`) and portal control ranges across all 51 Huawei Cloud services, see the [**Huawei Cloud Service Catalog**](services/index.md).

---

## 1. Declarative Quote Specification (`version: "1"`)

A file that starts with `version: "1"` is compiled offline in under 50ms (`autocalc compile --path quote.yaml`) before planning or applying.

```yaml
version: "1"

metadata:
  id: acme-latam-prod
  customer: "Acme Corp"
  title_prefix: "Acme Latam Core"    # List title prefix (sanitized to <= 55 chars, zero tool watermarks)
  currency: USD                      # Always USD

horizon:
  duration: 1y                       # Evaluation window: 1m | 1y
  billing_policy: as-specified       # as-specified (strict) | recommend-annual

defaults:
  provider: huawei
  region: sa-brazil-1                # Primary region (e.g. sa-brazil-1, la-south-2, ap-southeast-1)
  availability: multi-az             # single-az | multi-az
  billing: monthly                   # monthly | yearly | ondemand

templates:
  k8s_worker:
    service: ecs
    needs:
      vcpus: 8
      memory: "32 GiB"
    options:
      os: ubuntu-22.04
      system_disk:
        type: ultra-high-io
        size: "100 GiB"
      data_disks:
        - { type: high-io, size: "500 GiB" }

environments:
  prod:
    region: sa-brazil-1
    availability: multi-az
  dr:
    region: la-south-2
    availability: single-az

resources:
  - id: prod-workers
    environment: prod
    use: k8s_worker
    quantity: 6
    billing: yearly

  - id: prod-rds-mysql
    environment: prod
    service: rds
    billing: monthly
    needs:
      engine: mysql
      vcpus: 4
      memory: "16 GiB"
    options:
      storage_gb: "500 GB"

  - id: prod-media-obs
    environment: prod
    service: obs
    billing: ondemand
    options:
      storage_class: standard
      capacity: "10 TB"
      traffic: "5 TB/mo"
      read_requests: "5000k/mo"
      write_requests: "500k/mo"
```

### Top-Level Blocks (`version: "1"`)

| Block | Required | Description |
| :--- | :--- | :--- |
| `version` | Yes | Must be `"1"`. |
| `metadata` | Yes | `id` (non-empty string), `customer` (non-empty string), optional `title_prefix` (list name prefix, max 55 chars), optional `currency` (`USD`). |
| `horizon` | No | `duration`: `"1m"` (730h baseline, default) or `"1y"` (8760h / 12-month baseline). `billing_policy`: `"as-specified"` (default) or `"recommend-annual"`. |
| `defaults` | No | Default `provider` (`huawei`), `region`, `availability` (`single-az` \| `multi-az`), and `billing` (`monthly` \| `yearly` \| `ondemand`). |
| `templates` | No | Map of reusable resource archetypes (`service`, `needs`, `options`, `billing`, `availability`). Referenced by resources via `use: <template_name>`. |
| `environments` | No | Map of named environments (`prod`, `dr`, `edge`, etc.) that override `region` or `availability` for resources referencing `environment: <name>`. |
| `resources` | Yes | Non-empty list of resource declarations (`id`, `service` or `use`, `environment`, `quantity`, `billing`, `availability`, `needs`, `spec`, `options`). |

### Mandatory Physical Units

To prevent catastrophic 1,000x unit bugs (such as bare numbers being interpreted as TB instead of GB on OBS), `version: "1"` requires explicit physical units on dimensional strings:

| Dimension | Allowed Units | Examples |
| :--- | :--- | :--- |
| **Capacity / Memory / Storage** | `B`, `KB`, `KiB`, `MB`, `MiB`, `GB`, `GiB`, `TB`, `TiB`, `PB`, `PiB` | `"32 GiB"`, `"500 GB"`, `"10 TB"` |
| **Bandwidth** | `bit/s`, `bps`, `kbit/s`, `kbps`, `Mbit/s`, `Mbps`, `Gbit/s`, `Gbps` | `"10 Mbit/s"`, `"100 Mbps"`, `"1 Gbps"` |
| **Periodic Traffic** | Any capacity unit, optionally suffixed with `/mo`, `/month`, or `/m` | `"5 TB/mo"`, `"500 GB/month"` |
| **Duration** | `h`, `hr`, `hour`, `d`, `day`, `mo`, `month`, `y`, `year` | `"730 h"`, `"30 days"`, `"1 y"` |
| **Request Rates** | Integer or `k`, `M`, `B` suffix, optionally with `/mo` | `"5000k"`, `"50k/mo"`, `"10M/mo"` |

### Compiler Normalization & Safety Invariants

- **Service Aliases**: `dcs` → `redis`, `dmq` / `dms-kafka` → `kafka`, `dms-rabbitmq` → `rabbitmq`, `fg` / `functiongraph` → `function`, `sfs-turbo` → `sfsturbo`, `dc` / `direct-connect` → `dline`, `geminidb` → `nosql`, `kms` → `dew`, `mariadb` → `rdsformariadb`, `mongodb` → `dds`.
- **OS & Disk Shorthands**: `os: ubuntu-22.04` expands to `"Ubuntu 22.04 server 64bit"`, `almalinux-9.4` to `"AlmaLinux 9.4 64bit"`, etc. Disk types `high-io` (`SAS`), `ultra-high-io` (`SSD`), `general-ssd` (`GPSSD`), `extreme-ssd` (`ESSD`), `gpssd2`, and `essd2` normalize automatically.
- **Logical-to-Physical Card Splitting**: When variable usage metrics exceed vendor UI stepper caps (e.g., `dew` keys > 99 or API requests > 9,999 units; `obs` storage/traffic > 102,400 units or requests > 9,999 units), the compiler splits the logical resource into multiple physical cards (`<id>-1`, `<id>-2`, …).
- **Anti-Splitting Invariant**: Services with fixed baseline fees (`cce`, `nat`, `elb`, `dline`, `vpn`) and tiered OBS egress factors (`download.external`, `download.cdn`) are protected from multi-card splitting so base charges and marginal tier brackets are never distorted.
- **Wire Budgeting & Title Sanitization**: Lists are budgeted below 950 KiB and 200 cards per shard (`Part 1`, `Part 2`), and list titles are stripped of any `autocalc` watermark and capped at 55 characters.

---

## 2. Plain Quote File (`cards:`)

For quick quotes without `version: "1"`, write a `cards:` list directly:

```yaml
customer: Example Corp
name: "[autocalc] example"       # the saved list's name (apply)
settlement: total                # or monthly
defaults: { region: sa-brazil-1, billing: monthly }
cards:
  - id: web
    service: ecs
    quantity: 2
    needs: { vcpus: 4, memory_gb: 8 }      # or spec: c7n.xlarge.2.linux
    options:
      image: "Ubuntu 22.04 server 64bit"
      bandwidth_mbit: 10
```

```bash
autocalc plan-quote --path quote.yaml    # validate, resolve, rate; writes the lock file; saves nothing on the website
autocalc apply-quote --path quote.yaml   # plan, then publish through the fail-closed gate
```

* Validation is offline. An error names the card, the field, and the legal options or range, and points to the schema (`autocalc://schema/<service>` over MCP).
* `plan-quote` shows ranked candidates for an ambiguous card; choose one by writing `spec:`.
* `apply-quote` refuses unresolved cards, options the schema does not map, and an ECS image that matches several catalog images (`plan-quote` reports it as `image_choices`; set `options.image` to one exact name).
* [`example-project-quote.yaml`](example-project-quote.yaml) is a six-card project (ECS, EVS, RDS, Redis, NAT, OBS) that plans and publishes end to end.

---

## 3. Lockfiles (`quote.lock.yaml` / `quote.lock.json`)

Planning a quote file writes a deterministic lockfile beside the quote:
- `quote.lock.yaml` for `version: "1"` declarative quotes (records `input_hash`, `total_amount`, `shards`, and per-resource `sku_code`, `unit_price`, `total_price`, and `physical_cards`).
- `quote.lock.json` for plain `cards:` quotes (records `{ spec, price, needs }` per card ID).

If the live catalog price changes after a lockfile is written, `plan-quote` reports `lock_drift` and `apply-quote` blocks publication until you review and remove the drifted lock entry. Do not commit quote or lock files that hold client data.

---

## 4. Card Schemas (`src/schema/files/<service>.yaml`)

One YAML file per service in `src/schema/files/<service>.yaml`, generated from the live calculator page (anonymous; nothing is saved on the website).

```bash
autocalc schema pull ecs       # read the page, merge over the committed file, write it
autocalc schema coverage ecs   # mapped / unmapped / unsupported controls (offline)
autocalc schema diff ecs       # added, removed, changed controls vs the live page; writes nothing; exit 1 on drift
```

| Field | Source | Meaning |
| :--- | :--- | :--- |
| `id`, `kind`, `title`, `value_type`, `option_key`, `default` | generated | what the page says |
| `values: catalog` | generated | the option values depend on region or earlier choices; resolved from the catalog |
| `ranges` (`min`, `max`, `step`, `unit`, `when`) | generated | `when` is a regex on the selected spec code |
| `after`, `after_source` | generated | the control before this one in the form; `order` = form order, not a proven dependency. Only the immediate predecessor is listed; the rest follows transitively |
| `option` | hand-written | the name callers use in a quote file |
| `unsupported`, `note` | hand-written | deliberately not mapped, and why |
| `modes` | hand-written | the control exists only in these billing modes (the default-mode page hides it) |

Regeneration keeps the hand-written fields, matched by control id. `autocalc doctor` warns when a schema was generated on another frontend version than the live page.

Over MCP, agents read `autocalc://schema/index` (version and coverage per service) and `autocalc://schema/<service>` without needing a browser or login.
