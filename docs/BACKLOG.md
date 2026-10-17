# autocalc: product backlog

> Goal: an agent receives "price X for customer Y" and returns a **real Huawei Cloud calculator share link**
> (`calculator.html?shareListId=...`) plus a quote summary in pay-per-use, monthly, yearly and RI. The human only
> logs in once.

Last updated: 2026-10-13. Priorities: **P0** = needed for v1.0, **P1** = v1.x, **P2** = later.
Sizes: S ≤ ½ day, M ≈ 1–2 days, L ≈ 3–5 days.

---

## 0. Where we are (baseline, already working)

| Capability | Status | Evidence |
|---|---|---|
| Catalog for 97 services (menu, regions, SKUs, list prices) without login | ✅ | `productInfo`, `menuInfo`, `language` |
| Live rating engine (official prices, yearly discount) without login | ✅ | `ratingservice/v2/inquiry/resource` |
| USD to other currencies using Huawei's own rates | ✅ | `csbpaymentservice/v1/exchange-rate` |
| Read any saved list by ID without login | ✅ | `share/detail?key=` |
| Create a saved list and return a share link (logged in) | ✅ ECS only | `share/add`; generated list rendered in the real UI, total USD 1,138.63 matched |
| ECS card builder (VM, image, system and data disks, EIP) in monthly, yearly and on-demand | ✅ | Round-trip of 11 real cards: identical fields, totals to the cent |
| CLI (`autocalc`) and MCP server (7 tools) | ✅ prototype | `src/autocalc/` |
| Auth | ⚠️ manual | Paste "Copy as cURL" into `.session.curl` |

**Reference corpus:** the user's account has 37 saved lists (all readable through `share/detail`):

| service | items | lists | billing modes seen |
|---|---|---|---|
| ecs | 596 | 31 | RI (480), ONDEMAND (98), MONTHLY (16), YEARLY (2) |
| hecs (Flexus X) | 144 | 4 | ONDEMAND |
| rds | 36 | 4 | ONDEMAND (32), YEARLY (4) |
| evs | 35 | 14 | ONDEMAND (25), MONTHLY (5), YEARLY (5) |
| cbr | 17 | 9 | ONDEMAND, YEARLY |
| cce | 13 | 11 | ONDEMAND (8), YEARLY (5) |
| obs | 12 | 10 | ONDEMAND (10), MONTHLY, YEARLY |
| eip / elb / waf / vpn / dline / dew / function / maas / … | 1–7 each | | mixed |
| sfsturbo | 1 | 1 | YEARLY |
| **sfs (capacity-oriented)** | **0** | | **no sample yet** |

This corpus is the test oracle. Every builder must reproduce its cards (see "Definition of Done" in Epic B).

---

## Epic A: One-step setup and credentials (P0)

The user should not have to see a cURL command. Login happens once, and the session renews itself whenever possible.

### A1. `autocalc login` with a real browser window (P0, M)
- Launch Playwright Chromium **headed** with a **persistent profile** (`~/.local/share/autocalc/browser-profile`). WSLg shows the window on Windows 11.
- Open `https://www.huaweicloud.com/intl/en-us/pricing/calculator.html` and let the user log in by hand. That covers MFA, captcha and SSO, because we never handle the password.
- Detect success by polling `share/list`: a 200 response means logged in, `CBC.0101` means not yet.
- Read every `.huaweicloud.com` cookie from the browser context (HttpOnly included) and write `session.json` (cookies plus expiry plus the account mask, e.g. `masked_user`).
- **AC:** a fresh machine goes from `autocalc login` to "Logged in as H******048206 ✓" in under 60 seconds of user time, with no DevTools.

### A2. Silent session refresh (P0, M)
- Before each authenticated call, if the session is old or a call returns `CBC.0101`, reopen the persistent profile **headless**, load the calculator page and capture the cookies again. The SSO cookies (`HWS_INTL_ID`, `SessionID`, …) usually outlive the calculator session (`cbc-sid`).
- Only when silent refresh fails, raise `AUTH_EXPIRED` with the message "run `autocalc login`". The MCP tool returns the same text so the agent can tell the user.
- **AC:** with a profile 3 days old, `create_price_list` still works without user action. If not, the error names the exact command to run.

### A3. Find the minimal cookie set (P0, S)
- Bisect the cookie jar against `share/list` and `share/add` to learn which cookies are actually needed (probably `cbc-sid` plus a few SSO cookies). Record the expiry of each one.
- Store only the needed cookies, which reduces what gets leaked if the file is exposed. Document the expected lifetime.
- **AC:** README lists the required cookies and their observed TTL.

### A4. Import from the user's own browser (P1, M)
For users who are already logged in on Windows Chrome or Edge and don't want a second browser:
- **A4a. Tiny Chrome/Edge extension** (MV3, unpacked, about 50 lines) with one button, "Send session to autocalc". It reads cookies through `chrome.cookies.getAll({domain:"huaweicloud.com"})` (HttpOnly included) and POSTs them to `http://127.0.0.1:<port>/session`, where the MCP server or `autocalc auth listen` is waiting with a one-time token.
- **A4b. Paste fallback:** `autocalc auth import` reads "Copy as cURL" from the clipboard (`powershell.exe Get-Clipboard` on WSL) or stdin. It also accepts "Copy as cURL (cmd)" and "(PowerShell)".
- Note: reading Chrome's cookie database directly is **not** viable because Chrome 127+ uses app-bound encryption. Don't build that.

### A5. Secure storage (P0, S)
- Session lives in the OS keyring (`keyring` library). If none is available (WSL often lacks Secret Service), fall back to `~/.config/autocalc/session.json` with `chmod 600`.
- `.session.curl` in the repo is deprecated. Migrate it automatically on first run, then delete it.
- Never log cookie values. Redact them in errors and debug output.

### A6. Auth from the MCP side (P0, S)
- Tools: `auth_status()` (returns logged in or not, account mask, expiry estimate, readonly-mode flag) and `auth_login()` (runs A1 and blocks until done or a 5-minute timeout).
- Read-only tools (catalog, quote, `read_price_list`) **never** need auth. Only the write tools do.
- **AC:** in Claude Code, the user says "make a list…" while logged out. The agent calls `auth_login`, the browser opens, the user logs in, and the agent continues without being prompted again.

### A7. Multiple accounts and sites (P1, S)
- Named profiles: `autocalc login --profile partnerX` and `AUTOCALC_PROFILE`. This is useful when quoting from different accounts.
- Site setting: `intl` (portal-intl) now. Make `eu` (portal.eu) and `cn` (portal) configurable. The frontend already maps stations (`zh-CN`, `zh-HK`, `en-EU`).

### A8. Setup in one line per client (P0, S)
- Publish to PyPI (or install with `uvx --from git+https://…`):
  - Claude Code: `claude mcp add hwc-calculator -- uvx autocalc-mcp`
  - Claude Desktop / Cursor / VS Code: JSON snippets in the README.
- `autocalc doctor` checks network reachability for each endpoint, the frontend version, auth status, the cache directory and the Playwright browser, and prints the fix for each failure.
- `autocalc install-browser` wraps `playwright install chromium`.
- **AC:** the README "Quick start" has 3 commands: install, login, add MCP.

---

## Epic B: Service builders for the priority services (P0)

### B0. Builder framework (P0, L), needed before B1–B7
Today `ListBuilder.ecs()` is hand-written. To scale to 7 or more services:

- **B0.1 Service profile** (one Python module per service, `services/<code>.py`):
  - `schema`: a pydantic model of the agent-facing options (see each service below).
  - `products(opts, catalog) -> [ProductSpec]`: which catalog SKUs, sizes, usage values and `inquiryTag`.
  - `labels`: `addToList_title` / `addToList_product` token templates.
  - `rewrite(opts) -> rewriteValue`: the form state used by the UI's Edit button.
  - `buy_url(opts)` (optional).
  - `modes`: the supported billing modes.
- **B0.2 Shared core:** catalog SKU → product transform (drop `planList`, build `bakPlanList`, flatten the chosen plan, add on-demand `usageValue`/`usageMeasureId=4`), pricing through `inquiry` (with `normal`/`combine`/`localImage` tags), totals, `_cartId`/`timeTag`, `purchaseTime`/`purchaseNum` steppers.
- **B0.3 Label-token mining:** a script that walks the corpus, collects `addToList_*` and `template_RENDER` per service, and cross-checks them against `language?urlPath=all` and `config?urlPath=<svc>` JS. Output: a draft profile for each new service, which cuts manual work to about 1 hour per service.
- **B0.4 Golden tests:** fixtures are real cards from `share/detail` (stored with account data removed). The test rebuilds each card from its high-level options and diffs it. Ignored keys: `timeTag`, `_cartId`, `inquiryResult.id`. Catalog-drift keys (image `type`, `min_ram`) are a soft warning.
- **B0.5 Render test:** headless Chromium opens a generated link, clicks "View Details" and checks that the card count and the "Estimated Price" text match. This runs nightly and before release.

### Definition of Done for a service
1. Every supported billing mode is listed explicitly in the capability matrix (§1).
2. Golden test passes on **every** corpus card of that service (or a documented exception).
3. Render test passes for at least one generated list per mode.
4. Prices equal the `inquiry` result, and the card total equals the sum of its products.
5. Schema has a description and an example for each field, and validation errors name the valid choices.
6. The agent can find SKUs for it through `search_skus` / `describe_service`.
7. Works in at least São Paulo, Santiago and Mexico City2, and gives a clear error where the service or SKU is not sold (Epic E).

### B1. ECS: finish it (P0, M)
- **RI** (P0, 480 corpus items, the user's main quoting mode). Card order is image, then VM (RI plan: `skuCode`, `planId`, `paymentType` NO/PARTIAL/ALL_UPFRONT, `RITime` 1_3 or 3_3, `perPrice`/`perEffectivePrice`/`price` triplet), then system disk with `inquiryTag: "combine"` priced on demand for 730 h. `chargeMode: "RI"`, `periodType: 3`. The RI plans are in the ECS catalog's `planList` (`billingMode: "RI"`).
- Paid images: Windows and other images from the `ec2_vm.image` group, which carry their own price.
- EIP variants: bandwidth vs traffic billing, shared bandwidth, EIP without bandwidth.
- Multiple data disks of mixed types (the corpus has GPSSD and SAS in one card). Partly done, so add golden tests.
- Disk types GPSSD2 and ESSD2 with separate IOPS and throughput SKUs.
- Arm (Kunpeng) flavors.
- Validation: flavor not sold in the region gives "did you mean …" with the 5 nearest flavors by vCPU/RAM.

### B2. EVS standalone (P0, S)
- Corpus: 35 items in every mode. One product `hws.resource.type.volume`, labels `calc_4_ | calc_2_ | <size>detail_42_`, render `calculator_product_stepper`.
- Options: `type` (SATA, SAS, SSD, GPSSD, ESSD, GPSSD2, ESSD2), `size_gb`, `quantity`, and for GPSSD2/ESSD2 `iops`/`throughput_mbps` (extra SKUs `.iops`, `.throughput`). Snapshot (`ebs_snapshot`) is P1.
- Modes: PPU, monthly, yearly.

### B3. CCE (P0, M)
- Corpus: 13 items. Product `hws.resource.type.cce.cluster`, spec `cce.s1.small`, etc. Labels are 5 `dataInfo_*` tokens. Render `calculator_clustertype_radio`.
- Catalog: `cce_cce.cluster` (12 SKUs: type s1 or s2 (single or HA masters) × scale 50, 200, 1000 or 2000 nodes), `cce_cce.autopilot` (3), `cci_cci.autopilot` (15).
- Options: `cluster_type` (standard or turbo, HA true/false), `max_nodes`, `quantity`. Add a **composite helper** `cce_cluster(nodes=[{flavor, count, disks}])` that emits the CCE card plus ECS node cards, because worker nodes are billed as ECS.
- Autopilot (pay per vCPU/GB-hour) is P1.
- Modes: PPU, monthly, yearly. **Need monthly sample.**

### B4. OBS (P0, M)
Two quite different shapes:
- **Pay-per-use usage card** (10 corpus items) with up to 7 products, all `obs.001` with different `usageFactor`:
  - storage `size` (GB; note `productNum = 720`, the hours), `download.external` (internet egress GB), `get` and `put` (per 10k requests, measure 54), `delete`, `download.cdn`, `download_crr` (replication GB).
- Storage class (Standard, Infrequent Access, Archive, Deep Archive) and redundancy (single-AZ or multi-AZ, `size_warm_3az` etc.).
- **Storage packages** (monthly or yearly): `obs.storage.10tb`, `obs.storage.200tb`, … Labels `calc_1_ | <N>dataInfo_19_`.
- Options: `mode: "usage" | "package"`, `storage_gb`, `storage_class`, `multi_az`, `egress_gb`, `get_requests`, `put_requests`, `replication_gb` | `package_tb`.
- AC: a 1 TB Standard + 100 GB egress pay-per-use card matches the UI to the cent.

### B5. RDS (P0, L)
- Corpus: 36 items. Products `rds.vm` (flavor `rds.<engine>.<family>.<size>.<deploy>`, e.g. `rds.mysql.n1.xlarge.2.ha`) and `rds.volume` (`rds.<engine>.volume.<type>.<deploy>`, size GB). Render `calculator_rdsvm_radio`, `radio2`, `rdsvolume_stepper`.
- Catalog: 1,731 instance SKUs, 51 volume, plus `rds.decmem`, `rds.obs` (backup storage), `rds.proxy`.
- Options: `engine` (mysql, postgresql, sqlserver, mariadb), `version`, `deployment` (single, ha, read_replica), `vcpus`/`memory_gb` **or** `flavor`, `storage_type` (cloudssd, essd, gpssd2 with iops), `storage_gb`, `backup_gb` (P1), `quantity`.
- SQL Server editions (web, std, enterprise) carry license costs inside the flavor, so check them.
- Modes: PPU, monthly, yearly. **Need monthly sample.**

### B6. SFS / SFS Turbo (P0, M)
- **SFS Turbo** (corpus: 1 yearly item): product `hws.resource.type.sfsturbo`, spec `sfs.turbo.20MBps` (performance tier per TB), size GB, displayed in TB (measure 47). Render `calculator_sfsType_radio`, `calculator_sfsPeriod_36input`.
- **SFS capacity-oriented** (`sfs` service, `sfs_sfs` with 1 SKU, `sfs_sfs.turbo` with 10). **No corpus sample, so the user must create one** (§2).
- Options: `kind` (turbo or capacity), `tier` (standard, performance, 20/40/125/250/500/1000 MB/s per TB), `size_gb`, `quantity`.
- Modes: PPU, monthly, yearly.

### B7. ELB (P0, M)
- Corpus: 6 items. **Shared ELB** (`elbv2.basic.default`, plus `21_instance` for PPU). **Dedicated ELB** (`elb_elbv3`, 64 SKUs: L4/L7 × small/medium/large, LCU-based) has **no sample yet**.
- The ELB catalog also contains `vpc_ip` and `vpc_bandwidth` (EIP attached to the LB).
- Options: `type` (shared or dedicated), `spec` (`l4_small`, `l7_medium`, …), `az_count`, `eip_bandwidth_mbit`, `quantity`.
- Modes: PPU, monthly, yearly.

### B8. Next wave (P1), ordered by corpus use
`hecs` (Flexus X, 144 items) → `cbr` (17) → `eip` standalone (7) → `waf` → `vpn` → `dline` → `nat` → `function` → `dew` → `apig` → `lts` → `apm` → `nosql`/`dds` → `maas`/`modelarts`.

---

## Epic C: Agent experience (MCP) (P0)

The agent should do the whole job from a plain request. The tools must be self-describing and hard to misuse.

### C1. One unified write tool (P0, M)
```
create_price_list(
  name: str,
  items: list[ServiceItem],     # discriminated union on "service"
  dry_run: bool = False,        # build and price, don't save
  settlement: "total" | "monthly" = "total",   # list-level "Settlement Method" (billingModeTotal/Month)
  currency: "USD" | "BRL" | ... = "USD",       # appended to the link as &currentCurrency=
) -> {url, id, totals_by_mode, items[{service, title, mode, qty, amount}], warnings[]}
```
- `ServiceItem` = `EcsItem | EvsItem | CceItem | ObsItem | RdsItem | SfsItem | ElbItem`, each from its service profile schema. The MCP input schema then shows every field to the agent.
- `dry_run` returns the same structure without the URL. The agent can show the quote first and publish when the user agrees.
- `warnings`: substitutions such as "flavor X not in region, used Y", or "image matched 'Ubuntu 22.04 server 64bit'".

### C2. Discovery tools (P0, S)
- `describe_service(service)` returns the supported modes, an option schema with allowed values **for a given region** (disk types, engines, flavors summary) and 2 worked examples.
- `supported_services()` returns the capability matrix (§1), so the agent knows what it can and cannot build.
- `search_skus` (exists): add `family`, `arch`, and `max_price` filters.

### C3. List management tools (P0, S)
- `list_my_price_lists`, `read_price_list(url_or_id)` (anonymous; parses any shared link, including links other people send), `update_price_list(id, items|append)`, `duplicate_price_list`, `rename_price_list`, `delete_price_list` (asks for confirmation through the agent).
- `read_price_list` returns a normalized summary (service, spec, region, mode, qty, price), so the agent can **edit someone's list**: read, change, then save as a new list.

### C4. Multi-mode comparison (P0, S)
- `compare_modes(items, modes=["ondemand","monthly","yearly","ri_1y","ri_3y"])` returns a table of the monthly-equivalent cost per mode and the savings in %. Optionally it publishes one list per mode (the `…-PPU-V1` / `…-RI-V1` / `…-YEARLY-V1` naming the user already uses).
- Naming helper: `{date}-{CUSTOMER}-{MODE}-V{n}`, matching the corpus convention.

### C5. Agent instructions (P0, S)
- An MCP `prompts` entry `quote_workflow`: collect requirements → `describe_service` → `create_price_list(dry_run)` → confirm → publish → reply with the link and a table.
- Tool descriptions spell out units (GB vs TB, hours = 730/month, Mbit/s) and defaults.
- A skill or CLAUDE.md snippet for Claude Code users.

### C6. Excel export (P1, S)
- `export_price_list(id) -> .xlsx`, through `formExport` (the site's own Excel export) if it works with the session, otherwise local openpyxl.

---

## Epic D: Robustness and operations (P0/P1)

### D1. Frontend drift detection (P0, S)
- Store the frontend version seen in each saved list (`CBC-PortalCalculator/11.4.201`). `autocalc doctor` and nightly CI fetch the page and warn when it changes, then rerun golden and render tests.
- Contract test on endpoints: `URIMAP` paths are still in `framework.js` (fetch it with `uv run python scripts/fetch_bundle.py`).

### D2. Catalog caching (P0, S)
- Today: 24 h disk cache per (service, region). Add `--refresh` and per-service size limits (ECS is 4 MB per region). Use the CDN mirror first, because it's faster and survives an API outage.

### D3. Error model (P0, S)
- Map `CBC.6006` (spec not found), `CBC.6001` (missing param), `CBC.0101` (auth), `CBC.0102` (bad key) and HTTP 5xx to typed errors with fix hints. Retry with backoff on 5xx and timeouts.

### D4. Rate limiting and politeness (P1, S)
- Throttle `inquiry` calls (at most ~5 rps), batch products per card, and use a recognizable User-Agent. Don't hammer the public site.

### D5. Tests and CI (P0, M)
- Unit: transforms, label templates, CLI parsing.
- Golden: corpus fixtures (§B0.4).
- Live (nightly, opt-in): inquiry totals and anonymous `share/detail`.
- Render (nightly): headless check of a generated list (needs a CI test account session, P1).

### D6. Packaging (P0, S)
- `pyproject` entry points (done), version pin `mcp<2` (done; plan the FastMCP→MCPServer migration as P2), wheels, `uvx`, and optionally a Docker image for teams.

### D7. Docs (P0, S)
- README Quick start (3 commands), capability matrix, per-service option reference (generated from the schemas), troubleshooting (auth expired, region not sold), a security note on the session cookie.

---

## Epic E: Region compatibility (P0)

Region is already a parameter on every call, and Santiago works today: the corpus list `calculadora` is mostly `la-south-2`
and round-trips to the cent. Availability and prices still vary a lot by region (checked 2026-10-13):

| service (catalog SKUs) | São Paulo `sa-brazil-1` | Santiago `la-south-2` | Mexico City2 `la-north-2` | Mexico City1 `na-mexico-1` |
|---|---|---|---|---|
| ecs | 2369 | 1976 | 3021 | 772 |
| evs | 12 | 9 | 8 | 3 |
| cce | 30 | 12 | 42 | 12 |
| obs | 35 | 28 | 74 | 16 |
| rds | 1826 | 2037 | 2083 | 2016 |
| sfs (capacity) | 11 | **not sold** | **not sold** | **not sold** |
| sfsturbo | 12 | 10 | 10 | 10 |
| elb | 71 | 71 | 84 | 23 |

Example: c7n.large.2 monthly is **$40.26 in Santiago vs $62.02 in São Paulo**.

### E1. Region resolver (P0, S)
- Accept a region id, a display name or a city/country alias: "Santiago", "Chile", "São Paulo"/"Sao Paulo"/"Brazil", "Lima", "Buenos Aires", "Johannesburg", "Singapore", "Hong Kong", etc. Build it from `menuInfo.global` (id → display name) plus a small alias table (accent-insensitive).
- Ambiguity is an error with the choices listed. Example: "Mexico" gives `na-mexico-1` (Mexico City1) or `la-north-2` (Mexico City2), and the agent asks the user.
- **AC:** `region="Santiago"` resolves to `la-south-2`, and every tool accepts the friendly name.

### E2. Per-region availability validation (P0, M)
- Before building, check: the service is sold in the region (`menuInfos[].regionOnline.regionList`), the billing mode is offered there (`regionOnline[region].common`, e.g. `["PERIOD","ONDEMAND","RI"]`), and the flavor, disk type, image, engine or spec exists in that region's catalog.
- Errors must be actionable:
  - "SFS capacity-oriented is not sold in LA-Santiago. Options: SFS Turbo in la-south-2, or SFS in sa-brazil-1."
  - "c7.large.2 not sold in sa-brazil-1. Closest: c7n.large.2 (2 vCPU/4 GB, $62.02/mo)."
- `describe_service(service, region)` returns only the options valid **in that region**.
- **AC:** the same request in two regions never silently produces a broken card. It either builds or explains why not.

### E3. Cross-region comparison (P0, S)
- `compare_regions(items, regions=[...], mode=...)` prices the same bill of materials in several regions, with per-item substitutions where a SKU is missing and a total per region. It can publish one list per region.
- **AC:** "compare this setup in Santiago vs São Paulo vs Mexico City2" returns a single table plus optional links.

### E4. Multi-region lists (P1, S)
- One list can mix regions, because each card has its own `region` (the corpus mixes `sa-brazil-1` and `la-south-2` in one list). Make sure totals, naming and the summary group by region.

### E5. AZ / location handling (P2, S)
- Cards carry `locationType: "commonAZ"`. Check whether specific-AZ or edge locations (e.g. `af-south-1-los1a` in `menuInfo.global`) change SKUs or prices, and support them if they do.

### E6. Region coverage in tests (P0, S)
- Golden and render tests run every service in at least **São Paulo, Santiago and Mexico City2**. Catalog-shape differences between regions are a common source of breakage (missing groups, different `planList` modes).
- Add "works in ≥3 LATAM regions" to the Definition of Done.

---

## 1. Capability matrix (target for v1.0)

Legend: ✅ done · 🎯 v1.0 target · 🧪 needs corpus sample first · — not offered by Huawei

| Service | PPU (on-demand) | Monthly | Yearly | RI | Composite / notes |
|---|---|---|---|---|---|
| ECS | ✅ | ✅ | ✅ | 🎯 | VM + image + disks + EIP; Windows/paid images 🎯 |
| EVS | 🎯 | 🎯 | 🎯 | — | GPSSD2/ESSD2 IOPS & throughput 🎯 |
| CCE | 🎯 | 🧪🎯 | 🎯 | — | cluster + ECS node cards helper 🎯; autopilot P1 |
| OBS | 🎯 usage card | 🎯 package | 🎯 package | — | storage class, multi-AZ, egress, requests |
| RDS | 🎯 | 🧪🎯 | 🎯 | — | MySQL/PG/SQL Server/MariaDB, single/HA/replica |
| SFS Turbo | 🧪🎯 | 🧪🎯 | 🎯 | — | performance tiers |
| SFS (capacity) | 🧪🎯 | 🧪🎯 | 🧪🎯 | — | no sample yet; only sold in sa-brazil-1 within LATAM |
| ELB shared | 🎯 | 🧪🎯 | 🎯 | — | |
| ELB dedicated | 🧪🎯 | 🧪🎯 | 🧪🎯 | — | L4/L7 specs, LCU |
| quote only (no link), any of the 97 services | ✅ SKU-based | ✅ | ✅ | — | `quote` tool |

The matrix is returned by the `supported_services()` tool and kept in sync from the service profiles. The code is the source of truth.

---

## 2. Sample lists the user needs to create (unblocks the 🧪 items)

Make these once in the calculator UI ("Add to List" → "Save and Share") and send the links. Each one becomes a golden fixture. Region: São Paulo (sa-brazil-1) unless noted.

1. **CCE monthly**: one HA cluster (50 nodes), monthly, 1 month.
2. **RDS monthly**: MySQL HA 4 vCPU/16 GB + 200 GB cloud SSD, and PostgreSQL single + read replica, monthly.
3. **RDS extras**: SQL Server Standard HA (any size) on-demand, plus backup storage if the form offers it.
4. **SFS capacity-oriented**: 1 TB, on-demand **and** monthly (two cards).
5. **SFS Turbo**: Standard and Performance tiers, on-demand **and** monthly.
6. **ELB dedicated**: one L4 small + one L7 medium, with EIP bandwidth, on-demand **and** monthly; shared ELB monthly.
7. **EVS**: GPSSD2 with custom IOPS/throughput, on-demand.
8. **OBS**: Infrequent Access and Archive storage on-demand with egress plus requests; Standard multi-AZ.
9. **ECS extras**: Windows Server image, monthly; Kunpeng (Arm) flavor; EIP billed by traffic; RI 3-year all-upfront and partial-upfront.

---

## 3. Milestones

| Milestone | Contents | Exit criteria |
|---|---|---|
| **M1: "Real tool" setup** | A1, A2, A3, A5, A6, A8, D3, D7 (Quick start) | New user: install → login → link in under 5 minutes, no DevTools |
| **M2: Framework + ECS complete** | B0 (all), B1 (incl. RI), C1, C2, D5 golden, E1, E2, E6 | All 596 corpus ECS cards round-trip; RI list renders |
| **M3: Big seven** | B2–B7, §2 samples, C3, C4, E3 | Capability matrix fully ✅ for P0 cells |
| **M4: Hardening** | D1, D2, D4, B0.5 render CI, C5, C6, A4 | Nightly green; drift alert tested by pinning an old version |
| **M5: Next wave** | B8 services, A7 profiles | Per-service DoD |

---

## 4. Risks and open questions

- **Undocumented API.** Huawei can change `cartListData` or endpoints at any frontend release. Mitigations: D1 drift detection, golden and render tests, and a fallback that drives the UI with Playwright (slow but format-agnostic) behind the same tool interface (P2).
- **Terms of use / rate limits.** We only use the public calculator the way the UI does, at human-like rates, with lists saved to the user's own account. Keep it that way (D4).
- **Session security.** The session cookie gives access to the Huawei Cloud account, not just the calculator. A3 (minimal cookies), A5 (keyring) and redaction are P0. Open: is there a calculator-only token with narrower scope? Investigate the `cpqjwt` / CPQ flow found in the bundle.
- **Price accuracy.** List prices only; account discounts don't appear. A fresh `inquiry` runs at build time, but saved lists keep the old price as prices change over time.
- **Labels for new services.** The `addToList_*` tokens come from per-service config JS, so B0.3 mining is what keeps new services cheap to add.
- **Settlement "By monthly price"** (`billingModeMonth`) changes how the site shows totals (`monthlyAmount`/`installAmount`). Verify with a sample before exposing C1 `settlement="monthly"`.
