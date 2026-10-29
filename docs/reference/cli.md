# CLI reference

The `autocalc` command set. The commands below are written by hand; every MCP tool is also a
subcommand generated from the tool registry ([ADR-0007](../adr/0007-workflow-surface-and-one-registry.md)),
named with hyphens (`draft-quote`, `list-my-price-lists`, …). A generated command is skipped when a
hand-written one has the name, so `autocalc quote` is the hand-written one. Every command accepts `-h`.

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
| `autocalc export-quotes-xlsx --rows '[{"env":"prod","list":"<url or id>"}]' [--path quotes.xlsx]` | Write a workbook with four sheets: Quotes (environment, list name, total, link), Decisions (what was chosen and why), Resources (every priced resource) and Totals (instances, vCPUs, RAM, storage). Reads the lists anonymously; also an MCP tool | no |
| `autocalc login [--profile NAME] [--timeout S]` | Open a browser window and wait for you to sign in; prints the account and the browser used | — |
| `autocalc logout [--profile NAME]` | Sign out by deleting the browser profile, and delete any session copy left by an earlier version | — |
| `autocalc auth status [--profile NAME]` | Open the profile headless and show whether it is signed in (cookie names only, never values) | — |
| `autocalc lists` | List the saved lists in your account | yes |
| `autocalc doctor` | Check endpoints, frontend version, the chosen browser, whether a profile exists, and the cache (does not open the profile) | no |
| `autocalc update [--to vX.Y.Z]` | Reinstall from the newest release tag, or the one named; prints `old -> new`. Never runs on its own; tool results carry an `update_notice` at most once a day (`AUTOCALC_NO_UPDATE_CHECK=1` turns it off) | no |
| `autocalc install-browser` | Install Playwright's Chromium (only needed without a system browser) | no |

## Quote workflow

`draft-quote`, `revise-quote` and `publish-quote` are the only route to a share link. Scalar
parameters are options (`--customer acme`); lists and objects take JSON, or `@file.json`, and the
result prints as JSON.

```sh
autocalc draft-quote --customer acme --requirements @reqs.json   # ranked candidates, a draft id
autocalc revise-quote --draft-id d-1a2b3c4d --decisions @choices.json
autocalc publish-quote --draft-id d-1a2b3c4d --name "acme web tier"   # runs the publish gate
```

A requirement is `{"id","service","region","billing","quantity"?,"needs"?,"spec"?,"options"?}`.
`publish-quote` builds cards on the calculator page (a browser is needed). Support is restricted to services and options whose requested configuration can be preserved. Default-only recipes and known incomplete pricing paths are rejected before saving. The result carries `warnings` when the live calculator frontend differs from the verified version.

## Environment variables

| Variable | Effect |
|---|---|
| `AUTOCALC_PROFILE` | Named login profile (default `default`) |
| `AUTOCALC_CACHE` | Catalog cache directory (default `~/.cache/autocalc`) |
| `AUTOCALC_BROWSER` | Path of the Chromium-family browser to drive; overrides auto-detection (Chrome, then Edge, then Chromium, then Playwright's build) |
| `AUTOCALC_ENCODE_WORKERS` | Browser contexts `publish_quote` encodes cards with at once (default `6`; each is an isolated anonymous context) |

## MCP server

`autocalc-mcp` runs the MCP server (`hwc-calculator`) over stdio. Its tools are described by
the `mcp-surface` spec.

Configuration: `AUTOCALC_CONFIG` overrides the session/config directory (default `~/.config/autocalc`). `AUTOCALC_REPO` overrides the Git repository used for update checks.

`compare-modes` accepts `--hours` (monthly on-demand usage) and `--periods` (months or years);
monthly equivalents divide term totals by their duration. Use `inspect-draft` after a failed
publication. An `unknown_outcome` requires reconciling saved lists before `recover-draft` with
an explicit no-remote-list confirmation and justification. It never deletes remote lists.
