# Your first quote

This tutorial takes you from a fresh clone to a priced quote and a saved share link. It uses
today's CLI and MCP server. Commands are for a Linux or Windows shell with
[uv](https://docs.astral.sh/uv/) installed.

## 1. Install

```bash
git clone <repo-url> autocalc && cd autocalc
uv sync
```

## 2. Explore the catalog (no login needed)

Find out where ECS is sold, then search São Paulo for a Linux server with at least 4 vCPUs and
8 GB:

```bash
uv run autocalc regions ecs
uv run autocalc search ecs "Sao Paulo" linux --vcpus 4 --mem 8 --billing monthly --limit 5
```

The results are sorted cheapest first, with list prices in USD.

## 3. Price a bill of materials

Price three `c7n.large.2` servers with a 100 GB SSD each, monthly, in Santiago:

```bash
uv run autocalc quote Santiago 'ecs:c7n.large.2.linux*3' 'ecs:SSD*3@100' --billing monthly
```

The prices come from Huawei's own rating engine, so they match the website.

## 4. Sign in once

Saving a list needs your Huawei Cloud account:

```bash
uv run autocalc login
```

A browser window opens (your installed Chrome or Edge when there is one). Sign in by hand;
autocalc never sees your password. The session stays in that browser profile and nowhere else.
Check the result with `uv run autocalc auth status`.

## 5. Create the share link from your agent

Register the MCP server with Claude Code:

```bash
claude mcp add hwc-calculator -- uv --directory "$PWD" run autocalc-mcp
```

Then ask the agent, for example: *"Quote 3 c7n.large.2 Linux servers with 100 GB SSD each in
Santiago, monthly. Show me a dry run first."* The agent previews the list and publishes it once
you agree. It then replies with a `calculator.html?shareListId=…` link that anyone can open.

## 6. Check what you made

```bash
uv run autocalc lists                 # your saved lists
uv run autocalc validate <shareListId> # re-read the list and look for glitches
```

Next: read [List price vs Edit price](../explanation/huawei/edit-vs-list-price.md) to see why a
link has to be checked, not just created.
