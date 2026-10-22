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
| `autocalc login [--profile NAME] [--timeout S]` | Open a browser window and wait for you to sign in; prints the account and the browser used | — |
| `autocalc logout [--profile NAME]` | Sign out by deleting the browser profile, and delete any session copy left by an earlier version | — |
| `autocalc auth status [--profile NAME]` | Open the profile headless and show whether it is signed in (cookie names only, never values) | — |
| `autocalc lists` | List the saved lists in your account | yes |
| `autocalc doctor` | Check endpoints, frontend version, the chosen browser, whether a profile exists, and the cache (does not open the profile) | no |
| `autocalc update [--to vX.Y.Z]` | Reinstall from the newest release tag, or the one named; prints `old -> new`. Never runs on its own | no |
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
`publish-quote` builds the cards on the calculator page (a browser is needed) for the 45 verified services: ECS, EVS, CCE, ELB, OBS, RDS, SFS Turbo, API Gateway, APM, CBR, CCI, DEW, Direct Connect, FunctionGraph, Kafka, LTS, NAT, GeminiDB, RabbitMQ and WAF, plus the databases and storage services of wave 2 (GaussDB, RDS for MariaDB, TaurusDB, Flexus RDS, DCS for Redis and Memcached, DDS, DDM, DRS, SFS, DSS, SDRS, DES) and of wave 3 (ER, ESW, VPC Endpoint, EIP, VPN, Cloud Firewall, HSS, DBSS, DSC, SecMaster, DMS for RocketMQ, Flexus X) for the billing modes each sells. Other services fail before anything is saved. The result carries `warnings` when the live calculator frontend differs from the one a service was verified on.

## Environment variables

| Variable | Effect |
|---|---|
| `AUTOCALC_PROFILE` | Named login profile (default `default`) |
| `AUTOCALC_CACHE` | Catalog cache directory (default `~/.cache/autocalc`) |
| `AUTOCALC_BROWSER` | Path of the Chromium-family browser to drive; overrides auto-detection (Chrome, then Edge, then Chromium, then Playwright's build) |

## MCP server

`autocalc-mcp` runs the MCP server (`hwc-calculator`) over stdio. Its tools are described by
the `mcp-surface` spec.
