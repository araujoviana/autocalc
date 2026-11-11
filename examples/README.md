# LATAM quotation starters

Run from the repository root using Bun 1.4.4:

```bash
bun src/cli.ts plan --path examples/latam-sao-paulo.yaml
bun src/cli.ts plan --path examples/latam-santiago.yaml
```

These starters use the configurations verified by authenticated publication in both
regions: one HA CCE cluster at the 50-node scale, one Kafka cluster and one RabbitMQ
cluster. Each messaging cluster has three brokers and 200 GB of ultra storage per
broker. Billing is monthly. Edit the customer and list name for your quotation.

After reviewing the plan, publish the selected quotation:

```bash
bun src/cli.ts apply --path examples/latam-sao-paulo.yaml
```

Publication requires a logged-in calculator session (`bun src/cli.ts login`).
The tool checks saved, fresh rating-engine and Edit prices before returning its link.
Use the verified published total for the quotation; a plan covers primary SKU prices.

Workers, disks, public networking and ingress are separate billable components.
These starters do not include them. The broader IaaS audit remains open; custom
ELB LCUs encountered a portal input blocker in the combined acceptance check.
Multi-zone ELB selections are filtered out by the LATAM portal and are rejected.
See `docs/status.md` for current verified scope and `docs/how-to/run-tests.md` for
repeatable checks. This checkpoint does not claim full IaaS coverage.
