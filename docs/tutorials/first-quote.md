# Your first quote

This tutorial takes you from nothing to a priced quote and a saved share link. It uses
today's CLI and MCP server, on Linux or Windows.

## 1. Install

The installer needs `git`. It installs [uv](https://docs.astral.sh/uv/) if you don't have it,
then autocalc from the newest release tag, and registers the MCP server when the `claude` CLI
is present. The repository is private, so fetch the script with `gh`:

```bash
gh api repos/araujoviana/autocalc/contents/install.sh -H "Accept: application/vnd.github.raw" | sh
```

```powershell
gh api repos/araujoviana/autocalc/contents/install.ps1 -H "Accept: application/vnd.github.raw" | iex
```

`AUTOCALC_REF=<tag-or-branch>` installs another ref. Update later with `autocalc update`
(`--to vX.Y.Z` for a specific release); it never updates on its own.

## 2. Explore the catalog (no login needed)

Find out where ECS is sold, then search São Paulo for a Linux server with at least 4 vCPUs and
8 GB:

```bash
autocalc regions ecs
autocalc search ecs "Sao Paulo" linux --vcpus 4 --mem 8 --billing monthly --limit 5
```

The results are sorted cheapest first, with list prices in USD.

## 3. Price a bill of materials

Price three `c7n.large.2` servers with a 100 GB SSD each, monthly, in Santiago:

```bash
autocalc quote Santiago 'ecs:c7n.large.2.linux*3' 'ecs:SSD*3@100' --billing monthly
```

The prices come from Huawei's own rating engine, so they match the website.

## 4. Sign in once

Saving a list needs your Huawei Cloud account:

```bash
autocalc login
```

A browser window opens (your installed Chrome or Edge when there is one). Sign in by hand;
autocalc never sees your password. The session stays in that browser profile and nowhere else.
Check the result with `autocalc auth status`.

## 5. Create the share link from your agent

The installer registers the MCP server with Claude Code. If it could not (no `claude` on the
path then), do it by hand:

```bash
claude mcp add hwc-calculator -- autocalc-mcp
```

Then ask the agent, for example: *"Quote 3 c7n.large.2 Linux servers with 100 GB SSD each in
Santiago, monthly. Show me a dry run first."* The agent previews the list and publishes it once
you agree. It then replies with a `calculator.html?shareListId=…` link that anyone can open.

## 6. Check what you made

```bash
autocalc lists                 # your saved lists
autocalc validate <shareListId> # re-read the list and look for glitches
```

## 7. Put the links in a spreadsheet

Ask the agent: *"Export these lists to quotes.xlsx: prod is <link>, dev is <link>."* You get one
sheet with the environment, the list name, the total in USD and the link, plus a total row.

Next: read [List price vs Edit price](../explanation/huawei/edit-vs-list-price.md) to see why a
link has to be checked, not just created.
