# autocalc

Turns "price this for customer Y" into a share link on the
[Huawei Cloud pricing calculator](https://www.huaweicloud.com/intl/en-us/pricing/calculator.html).
Use it from the terminal (CLI) or from an AI agent (MCP server).

- Catalog and price queries need no login and no AK/SK. Prices are USD list prices from Huawei's
  own rating engine.
- Saving a list and getting a share link needs a one-time browser sign-in. autocalc never sees
  your password.

## Quick start

```bash
uv sync                                  # install
uv run autocalc login                    # sign in once (a browser opens)
claude mcp add hwc-calculator -- uv --directory "$PWD" run autocalc-mcp   # optional: MCP server
```

```bash
uv run autocalc search ecs "Sao Paulo" linux --vcpus 4 --mem 8
uv run autocalc quote Santiago 'ecs:c7n.large.2.linux*3' 'ecs:SSD*3@100' --billing monthly
uv run autocalc doctor                   # checks endpoints, login, browser and cache
```

## Docs

Start at [`docs/index.md`](docs/index.md) (or `uv run --group docs mkdocs serve`). The
[first-quote tutorial](docs/tutorials/first-quote.md) is the best entry point; the
[CLI reference](docs/reference/cli.md) and [architecture](docs/explanation/architecture.md) come next.

## Development

`uv sync --group dev --group docs`, then see [run the tests](docs/how-to/run-tests.md) for the
checks CI runs. Behavior is specified in [`openspec/specs/`](openspec/specs/), and changes go
through OpenSpec (`/opsx:propose`, `/opsx:apply`, `/opsx:archive`).

## Security

The login session gives access to your whole Huawei Cloud account, not just the calculator.
Cookie values are never logged, and sessions, the browser profile and the test corpus are
gitignored. Never commit client data. Details: [sessions](docs/explanation/huawei/sessions.md).
