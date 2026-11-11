# Project status

Last updated 2026-11-11. The current implementation is TypeScript on Bun, version
0.6.0. The LATAM work is available on the local
`feat/latam-cce-iaas-dms-coverage` branch; it has not been merged or released.
There are 51 committed service schemas. The publication registry labels
41 verified services; this label does not certify every regional configuration.

## Usable checkpoint

The current focus is quotation use in São Paulo (`sa-brazil-1`) and Santiago
(`la-south-2`). Start with `examples/latam-sao-paulo.yaml` or
`examples/latam-santiago.yaml` and the commands in `examples/README.md`.
These starters include the verified CCE, Kafka and RabbitMQ configurations below.
They omit worker, disk, network and ingress charges, which must be quoted separately.

Plan totals include primary SKU prices. Publication rates the actual card products,
including add-ons, and checks stored, rating-engine and Edit prices before returning
a share link. Use that verified published total for a quotation.

## Evidence checked on 2026-11-11

| Configuration | São Paulo | Santiago |
|---|---|---|
| CCE Standard/Turbo, HA, 50-node scale, monthly, one cluster | Full publication gate passed | Full publication gate passed |
| Kafka c6.2u4g.cluster, three brokers, 200 GB per broker, ultra storage, monthly | Full publication gate passed | Full publication gate passed |
| RabbitMQ c6.2u4g.cluster, version 3.8, three brokers, 200 GB per broker, ultra storage, monthly | Full publication gate passed | Full publication gate passed |
| ECS c7n.xlarge.4.linux, Ubuntu 22.04, six workers, monthly | Full publication gate passed on retry | Not independently certified in this checkpoint |

The first six observations are repeatable with the explicit authenticated suite in
[Run the tests](how-to/run-tests.md#synthetic-authenticated-publication).
Each passed without an Edit skip. Synthetic test lists were removed; existing
customer quotes were preserved. A sanitized observation record is stored in
`docs/compat/latam-publication-evidence-2026-11-11.json`.

These observations cover the listed configurations. They do not establish full IaaS
coverage, every service variant, every billing mode, or complete architecture
publication. The full offered-configuration denominator is still being audited.
Historical per-service replay reports in `docs/compat/` are separate evidence and
must not be treated as current authenticated regional certification.

## Test coverage

The offline suite now separates orchestration, semantic configuration contracts,
real strict publisher adapters, complete architecture component accounting, and
publication failure/recovery policy. The 20 business architecture fixtures use
synthetic catalogs and browser/save doubles. Their success checks orchestration;
live price and publication evidence comes from the authenticated gate.

Independent regression tests caught and drove fixes for invalid DMS broker counts,
incompatible RabbitMQ versions, unknown explicit specifications, lost ELB options,
card loss/duplication and cross-wired forms. Deliberate corruptions check that these
oracles actually reject wrong configurations. Details and commands are in
[Run the tests](how-to/run-tests.md#offline-test-scope).

## Known limits for this checkpoint

- The portal filters multi-zone ELB selections out of São Paulo and Santiago even
  though their raw catalogs contain corresponding rows. The tool rejects those
  selections; the starter examples omit ELB.
- CCE Autopilot is offered in São Paulo's catalog and implemented, but has not passed
  the authenticated acceptance matrix here. Santiago does not offer it.
- Standalone legacy CCE `t1`/`t2` SKUs cannot be added through the current portal;
  its Standard/Turbo selector uses the unified `s1`/`s2` family.
- Custom dedicated ELB LCUs encountered a portal input blocker during combined
  acceptance (the page retained 1 after a request for 5). Complete architecture
  publication remains unverified; the starters exclude this configuration.
- Network/page-loading and price-settling failures can still interrupt a run.
  The publish gate does not return an unverified quote as successful.
- The complete scoped IaaS audit, remaining finite CCE/DMS variant matrices and
  full architecture publication acceptance remain open in
  `openspec/changes/latam-cce-iaas-dms-coverage/tasks.md`.

Windows guest quotations, private NAT, RocketMQ, AWS and publication-blocked
services are excluded from this LATAM work. Windows host compatibility remains
in scope. Schema/control mappings and `VERIFIED` registry labels alone are not
proof of full live service coverage.
