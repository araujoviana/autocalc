# CLI reference

Every `autocalc` command outputs human-readable tables on an interactive terminal and structured JSON when piped or passed `--json`. Every command accepts `-h` / `--help`.

Regions accept either a **Region ID** (`sa-brazil-1`, `la-south-2`) or a **Geographic Location** (`"São Paulo"`, `Santiago`). `autocalc regions` displays all three columns (`REGION ID`, `LOCATION`, and `PORTAL LABEL`). Commands that touch your Huawei Cloud account use the profile from `--profile` or `AUTOCALC_PROFILE` (default `default`).

---

## Global Options

The following flags apply to all `autocalc` commands:

| Option | Description |
|---|---|
| `-h, --help` | Display help for command (or root command list) |
| `--version` | Display version number |
| `--headed` | Show browser windows during execution |
| `--profile <name>` | Named authentication profile (default: `default`) |
| `--json` | Force output formatted as structured JSON |

## Standard Streams Contract

- **`stdout`**: Normal command output (human-readable tables or formatted JSON when `--json` or piped).
- **`stderr`**: Error messages, warnings, and interactive progress/status indicators.

---

## 1. Catalog & Pricing (No Login Required)

| Command | Purpose | Needs login |
|---|---|---|
| `autocalc services [query]` | List services that have a calculator, optionally filtered | no |
| `autocalc regions [service]` | List all regions, or the regions where a service is sold | no |
| `autocalc describe SERVICE` | Show available billing modes and catalog groups for a service (`--region`) | no |
| `autocalc search SERVICE REGION [terms…]` | Search SKUs; `--billing ondemand\|monthly\|yearly`, `--vcpus N`, `--mem GB`, `--limit N`, `--refresh` (bypass the 24 h cache) | no |
| `autocalc quote REGION SERVICE:SPEC[*QTY][@SIZE] …` | Price items with the live rating engine; `--billing`, `--hours` (on-demand, default 730), `--periods` (monthly/yearly), `--currency` | no |
| `autocalc convert AMOUNT CURRENCY` | Convert a USD amount using Huawei Cloud FX rates | no |
| `autocalc compare-modes [ITEMS…]` | Compare ondemand, monthly, and yearly pricing (`--items <json\|@file>`, `--region`, `--modes`, `--currency`, `--hours`, `--periods`) | no |
| `autocalc compare-regions [ITEMS…] --regions <list>` | Compare item pricing across multiple regions (`--items <json\|@file>`, `--billing`) | no |
| `autocalc supported` | List supported card builders, billing modes, and publish gate verification status | no |

---

## 2. Declarative Quotes (YAML Files)

You can pass the quote file path as a positional argument (`autocalc plan quote.yaml`), with `--path` (`autocalc plan --path quote.yaml`), or omit it when the file is named `quote.yaml` in the current directory (`autocalc plan`).

| Command | Purpose | Needs login |
|---|---|---|
| `autocalc compile [FILE]` | Compile a `version: "1"` declarative quote file offline (<50ms) (`--path`) | no |
| `autocalc plan [FILE]` | Validate a quote YAML file against service schemas, resolve SKUs, rate, and write the lockfile (`--path`) | no |
| `autocalc apply [FILE]` | Encode cards in headless browser, save list, run the 3-way publish gate, and print the share link (`--path`, `--name`) | **yes** |
| `autocalc export --rows '[{"env":"prod","list":"<url or id>"}]'` | Write a workbook with four sheets (`Quotes`, `Decisions`, `Resources`, `Totals`) (`--path quotes.xlsx`) | no |

---

## 3. Shared Lists & Account

| Command | Purpose | Needs login |
|---|---|---|
| `autocalc read LIST_ID_OR_URL` | Read and display a shared price list anonymously | no |
| `autocalc validate LIST_ID_OR_URL` | Re-read a saved list anonymously and report arithmetic or catalog glitches | no |
| `autocalc edit-check LIST_ID_OR_URL` | Re-price saved cards in the calculator's headless Edit view (`--limit`) | no |
| `autocalc login [--profile NAME] [--timeout S]` | Open a browser window and wait for you to sign in; prints the account and browser used | — |
| `autocalc logout [--profile NAME]` | Sign out by clearing the local browser profile session | — |
| `autocalc auth status [--profile NAME]` | Show local authentication session status (cookie names only, never values; shortcut alias: `autocalc status`) | — |
| `autocalc lists` | List the saved price lists in your Huawei Cloud account | **yes** |
| `autocalc rename LIST_ID_OR_URL NAME` | Rename a saved price list | **yes** |
| `autocalc duplicate LIST_ID_OR_URL` | Duplicate a saved price list (`--name`) | **yes** |
| `autocalc delete LIST_ID_OR_URL --yes` | Delete a saved price list (requires `--yes`) | **yes** |

---

## 4. System & Schema Maintenance

| Command | Purpose | Needs login |
|---|---|---|
| `autocalc doctor` | Check endpoints, frontend version, browser detection, profile presence, and cache | no |
| `autocalc completion [shell] [target] [--install]` | Generate or install shell completion script (`bash`, `zsh`, `fish`). Use `--install` (or `autocalc completion install [target]`) to configure automatically | no |
| `autocalc schema <pull\|coverage\|diff> SERVICE` | Inspect or refresh service page schemas (`--json`) | no |
| `autocalc render-check LIST_ID_OR_URL` | Diagnostic check verifying card DOM elements render cleanly in browser | no |
| `autocalc page-controls SERVICE` | Diagnostic inspection of browser page controls for a service schema | no |
| `autocalc update [--to vX.Y.Z]` | Reinstall from the newest release tag, or the one named; prints `old -> new` (`AUTOCALC_NO_UPDATE_CHECK=1` disables daily check notices) | no |
| `autocalc install-browser` | Install Playwright's pinned Chromium (only needed without a system Chrome/Edge/Chromium) | no |

---

## 5. Agent & MCP Subcommands

Every MCP tool registered in `src/core/registry.ts` is also executable directly as a hyphenated CLI subcommand (`plan-quote`, `apply-quote`, `compile-quote`, `export-quotes-xlsx`, `draft-quote`, `revise-quote`, `publish-quote`, `list-drafts`, `inspect-draft`, `recover-draft`, etc., [ADR-0007](../adr/0007-workflow-surface-and-one-registry.md)). To keep `autocalc --help` clean for humans, those verbose agent aliases are hidden from the root help screen, while their `--help` flags remain available individually:

```sh
autocalc draft-quote --customer acme --requirements @reqs.json
autocalc revise-quote --draft-id d-1a2b3c4d --decisions @choices.json
autocalc publish-quote --draft-id d-1a2b3c4d --name "acme web tier"
```

---

## Environment variables

| Variable | Effect |
|---|---|
| `AUTOCALC_PROFILE` | Named login profile (default `default`) |
| `AUTOCALC_CONFIG` | Session credentials and update check cache directory (default `~/.config/autocalc`) |
| `AUTOCALC_DATA` | Drafts, run records, and browser profiles directory (default `~/.local/share/autocalc`) |
| `AUTOCALC_CACHE` | Catalog cache directory (default `~/.cache/autocalc`) |
| `AUTOCALC_BROWSER` | Path of the Chromium-family browser to drive; overrides auto-detection |
| `AUTOCALC_ENCODE_WORKERS` | Concurrent anonymous browser contexts used during card encoding (default `3 (or CPU/RAM budget)`) |
| `AUTOCALC_PAGE_HEADED` | Set to `1` to show browser windows during card encoding and gate checks |
| `AUTOCALC_SCHEMA_DIR` | Override directory path for service page schema definitions |
| `AUTOCALC_REPO` | Git repository URL or remote for release update checks and installations |
| `AUTOCALC_KEEP_ON_FAIL` | Set to `1` to keep a remote list that failed the publish gate for inspection |
| `AUTOCALC_NO_UPDATE_CHECK` | Set to `1` to disable the daily release update check notice |

---

## Exit Codes

| Exit Code | Meaning | Context / Triggers |
|---|---|---|
| `0` | Success | All requested operations and checks passed cleanly |
| `1` | Check / verification failure | Verification commands failed (`validate`, `edit-check`, `render-check`, or `doctor` with `ok: false`) |
| `2` | Validation error, syntax error, or CLI exception | Invalid arguments, schema validation failures, or runtime `CalculatorError` |
| `130` | Interrupted via `SIGINT` | Process terminated via `Ctrl+C` |
| `143` | Terminated via `SIGTERM` | Process killed by standard termination signal |
