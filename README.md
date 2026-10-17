# autocalc

Turns "price this for customer Y" into a **verified share link** on the Huawei Cloud pricing
calculator (<https://www.huaweicloud.com/intl/en-us/pricing/calculator.html>). It is built for
AI agents (as an MCP server) and for people at a terminal (as a CLI). AWS is planned as the
second provider.

- Catalog and price queries need **no login and no AK/SK**; prices come from Huawei's own
  rating engine, in USD list prices.
- Saving a list and getting a share link needs a one-time browser sign-in. autocalc never sees
  your password.

## Quick start

```bash
uv sync                                  # 1. install
uv run autocalc login                    # 2. sign in once (a browser opens)
claude mcp add hwc-calculator -- uv --directory "$PWD" run autocalc-mcp   # 3. wire up the MCP server
```

```bash
uv run autocalc search ecs "Sao Paulo" linux --vcpus 4 --mem 8
uv run autocalc quote Santiago 'ecs:c7n.large.2.linux*3' 'ecs:SSD*3@100' --billing monthly
uv run autocalc doctor                   # health check: endpoints, auth, browser, cache
```

## Documentation

The docs live in [`docs/`](docs/index.md) and build with
`uv run --group docs mkdocs serve`:

- **Tutorial:** [your first quote](docs/tutorials/first-quote.md)
- **How-to:** [run the tests](docs/how-to/run-tests.md),
  [refresh the golden corpus](docs/how-to/refresh-corpus.md),
  [fetch the calculator bundle](docs/how-to/fetch-bundle.md)
- **Reference:** [CLI](docs/reference/cli.md), [errors](docs/reference/errors.md),
  [Huawei calculator backend](docs/reference/huawei-backend.md)
- **Explanation:** [architecture](docs/explanation/architecture.md), and why the Huawei
  calculator is hard to drive, starting with
  [list price vs Edit price](docs/explanation/huawei/edit-vs-list-price.md)
- **Decisions:** [ADRs](docs/adr/index.md)

## Specs and changes (OpenSpec)

What autocalc must do is written as testable specs in [`openspec/specs/`](openspec/specs/):
provider-neutral capabilities at the top level and Huawei behavior under `huawei/`. Behavior
changes go through an OpenSpec change (`/opsx:propose` → `/opsx:apply` → `/opsx:archive`), and
a spec delta ships in the same change as the code that makes it true.

## Development

`uv sync --group dev --group docs`, then run the CI gate (lint, offline tests, strict docs
build) as described in [run the tests](docs/how-to/run-tests.md).

## Security note

The login session grants access to your Huawei Cloud **account**, not just the calculator.
It lives only in autocalc's browser profile directory (owner-only): it is never copied outside
it or to the keyring, and cookie values are never logged. The browser profile and the golden corpus are gitignored. Never commit client data. See [sessions](docs/explanation/huawei/sessions.md).
