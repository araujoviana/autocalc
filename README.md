# autocalc

Turns "price this for customer Y" into a share link on the
[Huawei Cloud pricing calculator](https://www.huaweicloud.com/intl/en-us/pricing/calculator.html).
Use it from the terminal (CLI) or from an AI agent (MCP server).

> **Experimental. Expect it to break.**
> autocalc is not a Huawei product and uses no official API. It drives the public pricing calculator
> the way a person would, and relies on that page's internals. When Huawei changes the page, publishing
> can fail or, worse, stop matching what the website shows, without any warning in advance.
> Before you send a link to anyone, open it and check the total yourself. Run `autocalc doctor` before
> relying on it, and do not use it for binding quotes. Prices are USD list prices, not an offer.

- Catalog and price queries need no login and no AK/SK. Prices are USD list prices from Huawei's
  own rating engine.
- Saving a list and getting a share link needs a one-time browser sign-in. autocalc never sees
  your password.

## Quick start

```bash
# 1. install (Windows: see the tutorial)
curl -fsSL https://raw.githubusercontent.com/araujoviana/autocalc/main/install.sh | sh
# 2. sign in (a browser opens)
autocalc login                           
```

The installer adds the MCP server to Claude Code when `claude` is on the path (otherwise:
`claude mcp add hwc-calculator -- autocalc-mcp`). `autocalc update` moves to the newest release.
Working on autocalc itself: `uv sync`, then prefix commands with `uv run`.

```bash
autocalc search ecs "Sao Paulo" linux --vcpus 4 --mem 8
autocalc quote Santiago 'ecs:c7n.large.2.linux*3' 'ecs:SSD*3@100' --billing monthly
autocalc doctor                   # health check: endpoints, auth, browser, cache
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

The login session grants access to your Huawei Cloud **account**, not just the calculator.
It lives only in autocalc's browser profile directory (owner-only): it is never copied outside
it, and cookie values are never logged. The browser profile and the golden corpus are gitignored. Never commit client data. See [sessions](docs/explanation/huawei/sessions.md).

## License

[Apache License 2.0](LICENSE).
