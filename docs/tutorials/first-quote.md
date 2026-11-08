# Your first quote

This tutorial takes you from nothing to a priced quote and a saved share link. It uses
today's CLI and MCP server, on Linux or Windows.

## 1. Install

The installer needs `git`. It installs [Bun](https://bun.sh) if you don't have it, then autocalc
from the newest release tag, and registers the MCP server when the `claude` CLI is present. Fetch
and run the script:

```bash
curl -fsSL https://raw.githubusercontent.com/araujoviana/autocalc/main/install.sh | sh
```

```powershell
irm https://raw.githubusercontent.com/araujoviana/autocalc/main/install.ps1 | iex
```

> Note: On headless Linux servers or Docker containers, run `autocalc install-browser` after installation.

`AUTOCALC_REF=<tag-or-branch>` installs another ref. Update later with `autocalc update`
(`--to vX.Y.Z` for a specific release); it never updates on its own. If `autocalc` is not found,
open a new shell: Bun puts it in `~/.bun/bin`.

## 2. Explore the catalog (no login needed)

Find out where ECS is sold (`autocalc regions` shows each region's technical **Region ID** like `sa-brazil-1`, its **Location** like `São Paulo, Brazil`, and Huawei's **Portal Label** like `LA-Sao Paulo1`). You can pass either the Region ID (`sa-brazil-1`) or the Location (`"São Paulo"`) to any command:

```bash
autocalc regions ecs
autocalc search ecs sa-brazil-1 linux --vcpus 4 --mem 8 --billing monthly --limit 5
# Or by location name:
autocalc search ecs "São Paulo" linux --vcpus 4 --mem 8 --billing monthly --limit 5
```

The results are sorted cheapest first, with list prices in USD.

## 3. Price a bill of materials

Price three `c7n.large.2` servers with a 100 GB SSD each, monthly, in Santiago (`la-south-2`):

```bash
autocalc quote la-south-2 'ecs:c7n.large.2.linux*3' 'ecs:SSD*3@100' --billing monthly
# Or by location name:
autocalc quote Santiago 'ecs:c7n.large.2.linux*3' 'ecs:SSD*3@100' --billing monthly
```

The prices come from Huawei's own rating engine, so they match the website.

autocalc uses a concise DSL syntax for CLI pricing:

```
service:spec[*quantity][@disk_size_gb]
```

- `service`: service identifier (e.g. `ecs`, `evs`, `obs`).
- `spec`: catalog resource spec code or flavor (e.g. `c7n.large.2.linux`, `SSD`).
- `*quantity`: optional resource count multiplier (e.g. `*3` for 3 instances).
- `@disk_size_gb`: optional capacity or attached disk size in gigabytes (e.g. `@100` for 100 GB).

## 4. Sign in once

Saving a list needs your Huawei Cloud account:

```bash
autocalc login
```

A browser window opens (your installed Chrome or Edge when there is one). Sign in by hand;
autocalc never sees your password. The session stays in that browser profile and nowhere else.
Check the result with `autocalc auth status`.

## 5. Create the share link

### From a quote file (a person at a terminal)

Write the quote as a file, check it, then publish it:

```yaml
# quote.yaml
customer: Example Corp
name: "[autocalc] example"
settlement: total
defaults: {region: sa-brazil-1, billing: monthly}
cards:
  - id: web
    service: ecs
    quantity: 2
    needs: {vcpus: 4, memory_gb: 8}
    options: {image: "Ubuntu 22.04 server 64bit"}
```

```bash
autocalc plan quote.yaml    # validates, picks the spec, prices it; saves nothing on the website
autocalc apply quote.yaml   # saves the list, checks it three ways, prints the link
```

Sample terminal output for planning and applying:

```text
$ autocalc plan quote.yaml
CARD  SPEC                PRICE    NOTES
web   c7n.large.2.linux   $98.40   -

✔ 1 cards resolved; ready to apply

$ autocalc apply quote.yaml
CARD  STORED   RATED    EDIT     CHECK
web   $98.40   $98.40   $98.40   ok

✔ Published [autocalc] example: 1 card verified
  https://calculator.intl.huaweicloud.com/calculator.html?shareListId=01234567-89ab-cdef-0123-456789abcdef
```

`plan` shows one row per card. If a card needs attention (an ambiguous image, an option the
schema does not map, a price that moved since the lock file), it says so before you apply. Name an
exact image with `options.image`; the default, `AlmaLinux`, matches several catalog versions.
`apply` prints progress while the headless browser works (about a minute), then a table of
stored, rated and Edit prices per card, and the link. If a list with the same name already exists
it warns and creates another. If a check fails, the list is deleted and nothing is left on your
account. Field reference: [Quote files](../reference/quote-files.md).

### From your agent

The installer registers the MCP server with Claude Code. If it could not (no `claude` on the
path then), do it by hand:

```bash
claude mcp add hwc-calculator -- autocalc-mcp
```

Then ask the agent, for example: *"Quote 3 c7n.large.2 Linux servers with 100 GB SSD each in
Santiago, monthly. Show me a dry run first."* The agent plans the quote and publishes it once
you agree. It then replies with a `calculator.html?shareListId=…` link that anyone can open.

## 6. Check what you made

```bash
autocalc lists                 # your saved lists
autocalc validate <shareListId> # re-read the list and look for glitches
```

## 7. Put the quotes in a workbook

Export multi-environment quotes to a structured Excel spreadsheet using the CLI:

```bash
autocalc export --rows '[{"env":"prod","list":"<url_or_id>"}]' --path quotes.xlsx
```

Or ask the agent: *"Export these lists to quotes.xlsx: prod is <link>, dev is <link>."* The workbook has
four sheets:

- **Quotes**: environment, list name, total in USD and the link, plus a total row.
- **Decisions**: each requirement, the spec that was chosen, who chose it and why. Lists saved by
  `publish_quote` find their decisions by themselves.
- **Resources**: every priced resource of every list.
- **Totals**: instances, vCPUs, RAM and storage per environment. Bandwidth, containers and usage-billed
  services are not counted, and the sheet says so.

Next: read [List price vs Edit price](../explanation/huawei/edit-vs-list-price.md) to see why a
link has to be checked, not just created.
