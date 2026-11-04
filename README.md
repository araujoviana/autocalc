# autocalc

Generate verified price quotes and share links for the [Huawei Cloud Pricing Calculator](https://www.huaweicloud.com/intl/en-us/pricing/calculator.html) from your terminal (CLI) or AI coding agents (MCP server).

> **Disclaimer**: `autocalc` is an unofficial, community-driven tool and is not affiliated with or endorsed by Huawei Cloud. It interfaces directly with public calculator endpoints and rating engines. Always inspect generated links and verify prices on the official portal before presenting formal quotes.

---

## Highlights

- **No login needed** for catalog queries, flavor search, and price calculations.
- **One-time browser login** only when saving quote lists and generating share links.
- **CLI & MCP server** out of the box (`autocalc` CLI and `autocalc-mcp` for Claude Code, Antigravity, etc.).
- **Built on TypeScript & Bun** with Playwright for browser interactions. Zero external runtime dependencies for core rating & schema operations.

---

## Quick Start

### Installation

**Linux / macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/araujoviana/autocalc/main/install.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/araujoviana/autocalc/main/install.ps1 | iex
```

*Requires [Bun](https://bun.sh).* To update anytime, run `autocalc update`.

### Basic Usage

```bash
# 1. Health check: verify connectivity and calculator frontend version
autocalc doctor

# 2. Search for available flavors and pricing
autocalc search ecs "Sao Paulo" linux --vcpus 4 --mem 8

# 3. Calculate a quote (standalone rating, no login needed)
autocalc quote Santiago 'ecs:c7n.large.2.linux*3' 'ecs:SSD*3@100' --billing monthly

# 4. (Optional) Sign in to save lists and generate shareable links
autocalc login
```

---

## MCP Server (AI Agents)

If Claude Code is installed, the installer automatically registers `hwc-calculator`. You can also configure it manually:

```bash
claude mcp add hwc-calculator -- autocalc-mcp
```

For configuration with other MCP clients, point to the `autocalc-mcp` binary or run `bun run src/mcp/index.ts`.

---

## Development

```bash
git clone https://github.com/araujoviana/autocalc.git
cd autocalc
bun install --frozen-lockfile

# Run checks and tests
bun run check
bun run check:boundaries
bun run test:offline
```

For contributing guidelines, specs, and architecture, see:
- [Tutorial: Your First Quote](docs/tutorials/first-quote.md)
- [CLI Reference](docs/reference/cli.md)
- [Architecture & Design](docs/explanation/architecture.md)
- [Contributing Guide](CONTRIBUTING.md)
- [OpenSpec Specifications](openspec/specs/)

---

## License

[Apache License 2.0](LICENSE)
