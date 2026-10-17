# autocalc

autocalc lets an AI agent, or a person at a terminal, turn "price this for customer Y" into a
**verified share link** on a cloud provider's own pricing calculator. Huawei Cloud is supported
today, and AWS is planned as the second provider.

The link is the deliverable. It opens without login, shows list prices in USD, and has to
re-price to the same amount when someone clicks **Edit**. A link that doesn't is a fatal bug,
not a cosmetic one ([ADR-0002](adr/0002-share-link-is-the-deliverable.md)).

## Where to go

| You want to… | Read |
|---|---|
| get a first quote and link working | [Tutorial: your first quote](tutorials/first-quote.md) |
| do a specific job (run tests, refresh fixtures) | [How-to guides](how-to/run-tests.md) |
| look up a command, an error code or an endpoint | [Reference](reference/cli.md) |
| understand why the calculator is hard to drive | [Explanation](explanation/architecture.md) |
| know why a decision was made | [Decisions (ADRs)](adr/index.md) |

## Where the truth lives

- **Specs** (`openspec/specs/`) say *what* autocalc must do, as testable requirements.
- **ADRs** (`docs/adr/`) say *why* a direction was chosen and which options were rejected.
- **These docs** teach and explain. When they disagree with a spec, the spec wins, and the
  disagreement is a docs bug.
