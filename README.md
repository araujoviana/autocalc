# autocalc

CLI and MCP server for pricing, validating, and publishing verified quotes on the Huawei Cloud Pricing Calculator.

## Installation & Update

**Linux / macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/araujoviana/autocalc/main/install.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/araujoviana/autocalc/main/install.ps1 | iex
```

Update to the latest release at any time:
```bash
autocalc update
```

*(From a local git clone, run `./install.sh` directly)*.

Browser automation uses system Chrome/Edge by default. On headless servers without a browser: `autocalc install-browser`.

---

## Quick Reference

### 1. Catalog & Pricing (No auth required)

```bash
# Verify environment and calculator endpoint reachability
autocalc doctor

# Query available regions and flavors
autocalc regions ecs
autocalc search ecs "Sao Paulo" linux --vcpus 4 --mem 8 --billing monthly

# Price resources directly
autocalc quote Santiago 'ecs:c7n.large.2.linux*3' 'ecs:SSD*3@100' --billing monthly
```

### 2. Declarative Quotes (`quote.yaml`)

```yaml
customer: Example Corp
name: "[autocalc] web-tier"
defaults: { region: sa-brazil-1, billing: monthly }
cards:
  - id: web
    service: ecs
    quantity: 2
    needs: { vcpus: 4, memory_gb: 8 }
    options: { image: "Ubuntu 22.04 server 64bit" }
```

```bash
# Validate schema, resolve SKUs, write quote.lock.yaml
autocalc plan quote.yaml

# One-time browser login (required only for saving/publishing quotes)
autocalc login

# Encode cards in headless browser, verify price integrity, and output share link
autocalc apply quote.yaml
```

### 3. Inspect & Export

```bash
# Verify stored vs. rated prices for an existing quote link
autocalc validate <shareListId_or_URL>

# Export shared lists to Excel
autocalc export --rows '[{"env":"prod","list":"<url_or_id>"}]' --path quotes.xlsx
```

---

## MCP Server (`autocalc-mcp`)

Connect AI agents via stdio:

```bash
claude mcp add hwc-calculator -- autocalc-mcp
```

Or configure manually in `mcp.json`:
```json
{
  "mcpServers": {
    "hwc-calculator": {
      "command": "autocalc-mcp"
    }
  }
}
```

---

## CLI Commands

| Command | Description | Auth Required |
| :--- | :--- | :--- |
| `autocalc services [query]` | List calculator services, optionally filtered by keyword | No |
| `autocalc regions [service]` | List all regions or regions where a service is sold | No |
| `autocalc describe <service>` | Show available billing modes and catalog groups | No |
| `autocalc search <service> <region> [terms...]` | Search SKUs with filters (`--billing`, `--vcpus`, `--mem`) | No |
| `autocalc quote <region> <items...>` | Price items directly in USD (`--currency` for FX) | No |
| `autocalc compare-modes --items <json\|@file>` | Compare on-demand, monthly, and yearly pricing | No |
| `autocalc compare-regions --items <json\|@file>` | Compare item pricing across multiple regions | No |
| `autocalc plan [file]` | Validate quote YAML against schemas and write lockfile | No |
| `autocalc apply [file]` | Encode cards, verify publish gate, and return share link | **Yes** |
| `autocalc export --rows <json\|@file>` | Generate `.xlsx` summary workbook from shared lists | No |
| `autocalc validate <url_or_id>` | Check shared list for arithmetic or schema discrepancies | No |
| `autocalc edit-check <url_or_id>` | Compare stored card prices against headless Edit view | No |
| `autocalc login` / `logout` / `auth status` | Manage browser authentication profiles | — |
| `autocalc lists` / `rename` / `delete` | Manage saved price lists in your account | **Yes** |
| `autocalc doctor` | Check endpoints, version drift, browser, and cache | No |

Full reference: [CLI Reference](docs/reference/cli.md).

---

## Configuration

| Variable | Default | Description |
| :--- | :--- | :--- |
| `AUTOCALC_PROFILE` | `default` | Named authentication profile for browser sessions |
| `AUTOCALC_CONFIG` | `~/.config/autocalc` | Directory for drafts, run records, and profiles |
| `AUTOCALC_CACHE` | `~/.cache/autocalc` | Directory for 24h catalog cache |
| `AUTOCALC_BROWSER` | *Auto-detected* | Custom path to Chrome/Chromium binary |
| `AUTOCALC_ENCODE_WORKERS` | `6` | Concurrency for headless browser encoding |
| `AUTOCALC_NO_UPDATE_CHECK` | `0` | Set to `1` to disable daily update notices |

---

## Development

```bash
bun install --frozen-lockfile
bun run check            # Typecheck (tsc --noEmit)
bun run check:boundaries # Verify architecture layer boundaries
bun run test:offline     # Unit and integration tests (deterministic, offline)
bun run test:live        # Live tests against calculator endpoints
```

Detailed documentation: [docs/](docs/index.md) · [CLI Reference](docs/reference/cli.md) · [ADRs](docs/adr/index.md).

## License

[Apache 2.0](LICENSE)
