# CLI reference

The current `autocalc` command set. It will be regenerated from the tool registry when the
workflow surface ships ([ADR-0007](../adr/0007-workflow-surface-and-one-registry.md)). Every
command accepts `-h`.

Regions accept an id (`sa-brazil-1`) or a friendly name (`"São Paulo"`, `Santiago`). Commands
that touch the account use the profile from `--profile` or `AUTOCALC_PROFILE` (default
`default`).

| Command | Purpose | Needs login |
|---|---|---|
| `autocalc services [query]` | List services that have a calculator, optionally filtered | no |
| `autocalc regions [service]` | List regions, or the regions where a service is sold | no |
| `autocalc search SERVICE REGION [terms…]` | Search SKUs; `--billing ondemand\|monthly\|yearly`, `--vcpus N`, `--mem GB`, `--limit N`, `--refresh` (bypass the 24 h cache) | no |
| `autocalc quote REGION SERVICE:SPEC[*QTY][@SIZE] …` | Price items with the live rating engine; `--billing`, `--hours` (on-demand, default 730), `--periods` (monthly/yearly), `--currency` | no |
| `autocalc validate LIST_ID` | Re-read a saved list anonymously and report glitches | no |
| `autocalc login [--profile NAME] [--timeout S]` | Open a browser window and wait for you to sign in | — |
| `autocalc logout` | Forget the stored session | — |
| `autocalc auth status` | Show whether you are logged in (cookie names only, never values) | — |
| `autocalc auth import [FILE\|-]` | Import a session from a browser "Copy as cURL" | — |
| `autocalc lists` | List the saved lists in your account | yes |
| `autocalc doctor` | Check endpoints, frontend version, auth, browser and cache | no |
| `autocalc install-browser` | Install Playwright's Chromium (only needed without a system browser) | no |

## Environment variables

| Variable | Effect |
|---|---|
| `AUTOCALC_PROFILE` | Named login profile (default `default`) |
| `AUTOCALC_CACHE` | Catalog cache directory (default `~/.cache/autocalc`) |
| `AUTOCALC_BROWSER` | Path of the Chromium-family browser to drive; overrides auto-detection |

## MCP server

`autocalc-mcp` runs the MCP server (`hwc-calculator`) over stdio. Its tools are described by
the `mcp-surface` spec.
