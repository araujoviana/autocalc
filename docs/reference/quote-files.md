# Quote files and card schemas

Status: accepted ([ADR-0018](../adr/0018-declarative-quotes-and-generated-card-schema.md)).

## Card schema

One YAML file per service in `src/schema/files/<service>.yaml`, generated from the live
calculator page (anonymous; nothing is saved on the website).

```bash
autocalc schema pull ecs       # read the page, merge over the committed file, write it
autocalc schema coverage ecs   # mapped / unmapped / unsupported controls (offline)
autocalc schema diff ecs       # added, removed, changed controls vs the live page; writes nothing; exit 1 on drift
```

| Field | Source | Meaning |
|---|---|---|
| `id`, `kind`, `title`, `value_type`, `option_key`, `default` | generated | what the page says |
| `values: catalog` | generated | the option values depend on region or earlier choices; resolved from the catalog |
| `ranges` (`min`, `max`, `step`, `unit`, `when`) | generated | `when` is a regex on the selected spec code |
| `after`, `after_source` | generated | the control before this one in the form; `order` = form order, not a proven dependency. Only the immediate predecessor is listed; the rest follows transitively |
| `option` | hand-written | the name callers use in a quote file |
| `unsupported`, `note` | hand-written | deliberately not mapped, and why |
| `modes` | hand-written | the control exists only in these billing modes (the default-mode page hides it) |

Regeneration keeps the hand-written fields, matched by control id. `autocalc doctor` warns when a
schema was generated on another frontend version than the live page. The JSON Schema of the file
format is `ServiceSchema.model_json_schema()`.

## Quote file

```yaml
customer: Example Corp
name: "[autocalc] example"       # the saved list's name (apply)
settlement: total                # or monthly
defaults: {region: sa-brazil-1, billing: monthly}
cards:
  - id: web
    service: ecs
    quantity: 2
    needs: {vcpus: 4, memory_gb: 8}      # or spec: c7n.xlarge.2
    options: {bandwidth_mbit: 10}
```

```bash
autocalc plan-quote --path quote.yaml    # validate, resolve, rate; writes the lock file; saves nothing on the website
autocalc apply-quote --path quote.yaml   # plan, then publish through the fail-closed gate
```

* Validation is offline. An error names the card, the field, and the legal options or range, and
  points to the schema (`autocalc://schema/<service>` over MCP).
* `plan` shows ranked candidates for an ambiguous card; choose one by writing `spec:`.
* The lock file (`quote.lock.json` beside a plain quote file, `quote.lock.yaml` for a `version: "1"` file) pins the resolved spec and its price. A moved
  price is reported as `lock_drift` and blocks `apply` until you delete that entry.
* `apply` refuses unresolved cards, options the schema does not map, and an ECS image that matches
  several catalog images (`plan` reports it as `image_choices`; set `options.image` to one exact name).
* `apply` warns, and still publishes, when a saved list of the same name exists.
* Do not commit quote or lock files that hold client data.

## MCP

Tools `plan_quote(path)` and `apply_quote(path, name)`. Resources `autocalc://schema/index`
(version and coverage per service) and `autocalc://schema/<service>`; they need no login and no
browser.

## Declarative files (`version: "1"`)

A file that starts with `version: "1"` is compiled offline before planning: physical units are
mandatory (`GB`, `TB`, `Mbit/s`, `h`, `mo`), `templates` give DRY machine archetypes, and the
compiler produces a deterministic canonical IR and `quote.lock.yaml`. Large quotes are budgeted
against the calculator's request limit and split into several lists, never splitting a card that
carries a base cost (CCE, NAT, ELB). Design: [ADR-0018](../adr/0018-declarative-quotes-and-generated-card-schema.md) and
`openspec/specs/core/declarative-compiler/spec.md`.

## Example

[`example-project-quote.yaml`](example-project-quote.yaml) is a six-card project (ECS, EVS, RDS, Redis,
NAT, OBS) that plans and publishes end to end. Notes from building it:

- `spec` is the catalog code, not the console name: an ECS flavor carries its OS (`c7n.large.2.linux`),
  EVS takes the disk type (`GPSSD2.storage`), RDS picks the engine's Cloud SSD volume unless `options.storage_spec` names another; set `options.storage_gb`.
- NAT takes monthly, yearly and on-demand billing; the public gateway is `natgateway_*`, and the
  `privatenat_*` codes are a different product.
- A usage card (OBS) is priced when the list is rated, so `plan-quote` shows no price for it.
