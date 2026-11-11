# Run the tests

## The CI gate

These commands mirror `.github/workflows/ci.yml`. Run them before pushing:

```bash
bun install --frozen-lockfile   # install locked dependencies
bun run check                   # TypeScript typecheck
bun run check:boundaries        # core/interface boundary checks
bun run test:offline            # offline tests: no network, session or corpus needed
bun run docs:build              # this documentation site (or: uv run --with mkdocs-material mkdocs build --strict)
```

## Live checks (by hand)

```bash
bun run test:live                        # read-only checks against the real calculator
bun scripts/template-audit.ts            # golden-corpus Edit agreement check
bun tests/support/region-sweep.ts        # 50-service live page verification across regions
```

The **golden corpus** is a local collection of real, verified saved quotes pulled from your Huawei Cloud account, used to verify that card reconstruction and Edit views never drift.

- `bun run test:live` needs network access. The golden corpus checks also need the local corpus
  ([Refresh the golden corpus](refresh-corpus.md)).

Synthetic public form requests in `tests/fixtures/public/` run offline in CI. They contain no
customer cards. The `Anonymous calculator drift` workflow can be dispatched manually and runs
weekly against anonymous page/rating endpoints. It needs no account secrets and saves no lists.

## Synthetic authenticated publication

After `bun src/cli.ts login`, run:

```bash
AUTOCALC_LIVE_PUBLICATION=1 bun test tests/live/latam-publication.test.ts
```

This explicitly opts into creating temporary lists on the logged-in account. The six
checks cover one monthly CCE configuration and one Kafka/RabbitMQ cluster configuration
in each of São Paulo and Santiago. Each requires stored, rating-engine and Edit prices
to agree, with no Edit skip. Cleanup selects only the exact random test name and IDs
that did not exist before that test. Ordinary live checks do not enable these writes.

These cases establish evidence for their exact configurations. Full regional coverage
also requires the offered variant/billing matrix and complete architecture acceptance.

## Offline test scope

- `business-scenarios.test.ts` checks orchestration across 20 synthetic architecture files,
  including exact input forwarding and the complete published resource multiset.
- `semantic-contracts.test.ts` checks literal vendor-observed controls, product multiplicity,
  capacities, units, region and billing using real builders. Deliberate corruptions must fail.
- `latam-architecture.test.ts` combines the real compiler, planner, publisher adapter and
  builders for CCE, Linux workers, disks, ELB, EIP, Kafka and RabbitMQ in both regions.
  It checks component quantities and primary-SKU subtotal accounting. Browser/save and
  DMS/ECS planning prices are synthetic; add-ons require live rating.
- `publish-failure-matrix.test.ts` exercises the real verification and publication gate
  across 96 combinations of save ambiguity, verification failure, retention and deletion.

Offline success does not establish live prices, regional availability or publication success.
