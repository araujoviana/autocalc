# autocalc

Headless Huawei Cloud pricing calculator. It talks directly to the public backend of
<https://www.huaweicloud.com/intl/en-us/pricing/calculator.html>. Catalog and price
queries need **no login and no AK/SK**; saving a list and getting a share link needs a
one-time browser sign-in.

## Quick start (3 commands)

```bash
uv sync                                  # 1. install
uv run autocalc login                    # 2. sign in once (a browser opens)
claude mcp add hwc-calculator -- uv --directory ~/code/autocalc run autocalc-mcp   # 3. wire up the MCP server
```

```bash
uv run autocalc services data                     # services that have a calculator
uv run autocalc regions ecs
uv run autocalc search ecs "Sao Paulo" linux --vcpus 4 --mem 8
uv run autocalc quote Santiago 'ecs:c7n.large.2.linux*3' 'ecs:SSD*3@100' --billing monthly --currency BRL
uv run autocalc doctor                            # health check: endpoints, auth, browser, cache
```

MCP tools: `list_services`, `list_regions`, `describe_service`, `supported_services`,
`search_skus`, `quote`, `convert_currency`, `compare_modes`, `compare_regions`,
`create_price_list`, `read_price_list`, `list_my_price_lists`, `delete_price_list`,
`rename_price_list`, `duplicate_price_list`, `auth_status`, `auth_login`.

Catalog responses are cached for 24h in `~/.cache/autocalc` (override with `AUTOCALC_CACHE`).

## One-time login and sessions (Epic A)

`autocalc login` launches a **headed** Chromium with a persistent profile
(`~/.local/share/autocalc/browser-profile`; WSLg shows the window on Windows 11),
opens the calculator and waits for you to sign in by hand. That covers MFA, captcha
and SSO, because autocalc never sees your password. When you are in, it reads every
`.huaweicloud.com` cookie (HttpOnly included), verifies it against `share/list`, and
stores it:

* in your **OS keyring** when a Secret Service is available, otherwise
* a `0600` file at `~/.config/autocalc/session.json` (WSL usually takes this path).

Before every authenticated call, a stale session (`CBC.0101`) triggers a **silent
refresh** from the persistent profile (headless). Only if that fails does the tool
raise `AUTH_EXPIRED` with the fix: run `autocalc login`.

```bash
uv run autocalc auth status              # logged in? account mask, age, cookie count
uv run autocalc login --profile partnerX # named profiles (AUTOCALC_PROFILE)
uv run autocalc auth import              # paste a 'Copy as cURL' from the clipboard (fallback)
uv run autocalc logout
```

Only the write endpoints (`share/add`, `share/list`, `share/update`, `share/delete`,
`share/copy`, `formExport`) need a session. Catalog, rating, currency and anonymous
`share/detail` never do.

### Required cookies (A3, measured 2026-10-13)

Bisected against `share/list` and `share/add`: **`HWS_INTL_ID` alone authenticates**
(all singletons and pairs without it returned `CBC.0101`). `cbc-sid` alone does **not**
work; the calculator session is short-lived while `HWS_INTL_ID` is the SSO cookie that
outlives it, which is what makes silent refresh work. autocalc stores the full jar
(minus nothing) because the write call also carries a `csrf` cookie when present; the
minimal-set optimisation is safe to add for stricter exposure budgets.

Cookie values are never logged; errors and `auth status` show cookie *names* only.

## Capability matrix

Legend: ✅ done · 🧪 needs a corpus sample · — not offered.

| Service | PPU (on-demand) | Monthly | Yearly | RI | Notes |
|---|---|---|---|---|---|
| ECS | ✅ | ✅ | ✅ | ✅ | VM + image + disks + EIP bandwidth |
| EVS | ✅ | ✅ | ✅ | — | standalone volumes |
| CCE | ✅ | ✅ | ✅ | — | cluster card |
| OBS | ✅ usage card | ✅ package | ✅ package | — | storage class, multi-AZ, egress, requests |
| RDS | ✅ | ✅ | ✅ | — | instance + volume |
| SFS Turbo | ✅ | ✅ | ✅ | — | performance tiers |
| ELB | ✅ | ✅ | ✅ | — | shared; dedicated P1 |
| quote only (no link), any of the 97 services | ✅ | ✅ | ✅ | — | `quote` tool |

`supported_services()` returns this matrix live from the service profiles.

## Region support (Epic E)

Every tool accepts a region id or a friendly name: `Santiago`, `Chile`, `São Paulo`/
`Sao Paulo`/`Brazil`, `Lima`, `Buenos Aires`, `Johannesburg`, `Singapore`,
`Mexico City2`… Ambiguity is an explicit error (e.g. `Mexico` →
`na-mexico-1` or `la-north-2`) that lists the choices. Before building, availability is
checked (service sold? mode offered? SKU present?) and failures are actionable, e.g.
*"SFS is not sold in la-south-2. Options: …"* or *"c7.large.2 not sold; closest: …"*.
`compare_regions` prices one bill of materials across several regions.

## Reverse-engineered API (as of 2026-10-13, frontend `CBC-PortalCalculator/11.4.201`)

Source bundle: `https://portal.hc-cdn.com/CBC-PortalCalculator/<ver>/framework.js` (`URIMAP`).
Host for the intl site is `portal-intl.huaweicloud.com` (`portal.` for China, `portal.eu.` for EU).
All the endpoints below answered without cookies.

| Purpose | Method / path (prefix `https://portal-intl.huaweicloud.com/api/`) |
|---|---|
| Service menu, regions, unit IDs | `GET calculator/rest/cbc/portalcalculatornodeservice/v4/api/menuInfo?sign=common&language=en-us` |
| Full price list of a service in a region | `GET .../v4/api/productInfo?urlPath=ecs&tag=general.online.portal&region=sa-brazil-1&tab=calc&sign=common` |
| Label pack (`dataInfo_N_` / `calc_N_` placeholders) | `GET .../v4/api/language?urlPath=all&language=en-us` (keyed by service) |
| Per-service UI logic (JS) | `GET .../v4/api/config?urlPath=obs&sign=common` |
| **Live rating engine** | `POST cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource` |
| Exchange rates (USD base) | `GET cbc/global/rest/cbc/csbpaymentservice/v1/exchange-rate?page_no=1&page_size=100` |
| Savings-plan prices | `cbc/global/rest/cbc/cbcequitymgmtservice/v2/savings-plans/price-list` (not explored) |
| Saved estimates (share/*), Excel export | `.../v4/api/share/{add,list,detail,update,delete,copy}`, `.../formExport`: these need a logged-in session |

CDN mirror (the frontend's disaster-recovery fallback, same JSON):
`https://res-static.hc-cdn.cn/pricecalculator/intl/product/{service}_general.online.portal_{region}_calc_productInfo.json`
and `.../common_en-us_menuInfo.json`.

### productInfo shape

`product[group][]`, where each item has `cloudServiceType`, `resourceType`, `resourceSpecCode`,
`productSpecSysDesc` and `planList[]` (`billingMode` ONDEMAND/MONTHLY/YEARLY/RI, `amount` in USD,
`usageFactor`, `measureUnit`). ECS in sa-brazil-1 is about 4 MB and 2,144 VM SKUs, and it also
contains EVS disks, EIP and bandwidth.

### inquiry body

```json
{"regionId":"sa-brazil-1","chargingMode":0,"periodType":2,"periodNum":1,"subscriptionNum":1,"siteCode":"HWC",
 "productInfos":[
  {"id":"a","cloudServiceType":"hws.service.type.ec2","resourceType":"hws.resource.type.vm","resourceSpecCode":"c7n.large.2.linux","productNum":3},
  {"id":"b","cloudServiceType":"hws.service.type.ebs","resourceType":"hws.resource.type.volume","resourceSpecCode":"SSD","productNum":3,"resourceSize":100,"resouceSizeMeasureId":17}]}
```

- `chargingMode`: 0 = period (monthly/yearly), 1 = on-demand, 10 = RI.
- `periodType`: 2 = month, 3 = year, 4 = hour.
- On-demand items need `usageFactor` (`Duration` for compute; per-plan values such as `size_warm_3az` for OBS), plus `usageMeasureId` (4 = hour, 10/17 = GB, 54 = requests) and `usageValue`.
- The misspelling `resouceSizeMeasureId` is the API's own.
- Errors come back as `{"exceptionId":"CBC.6006", ...}`, mapped to typed errors (`SPEC_NOT_FOUND`, `AUTH_EXPIRED`, …) with fix hints.

## Saved lists and share links

`create_price_list` (MCP) and the service builders build cards (VM, image, disks, EIP,
volumes, clusters, buckets, DB instances…) and save them to your calculator account
through `share/add`, returning `calculator.html?shareListId=<id>`. Anyone can open the
link without logging in.

* Item format: `cartListData[] = {buyUrl, rewriteValue, selectedProduct}`. A card product
  is the catalog SKU minus `planList`, plus `bakPlanList` (plans of the chosen mode), the
  chosen plan's fields, `productNum`/`resourceSize`/`inquiryTag`/`selectIndex`, the
  `addToList_*` label tokens and `inquiryResult`. `share/detail` reads any list
  anonymously, so it is both the reference format and the test oracle.
* Every builder is validated by a **golden test** that re-reads real saved lists from a
  corpus (`tests/fixtures/corpus/`), rebuilds each card from its high-level options and
  diffs it (ignoring `timeTag`, `_cartId`, `inquiryResult.id`). See `docs/BACKLOG.md`.

### Verified coverage (2026-10-13, against 734 corpus cards)

> **Dated snapshot.** These numbers are from 2026-10-13. Catalog drift (delisted images and
> flavors, changed RI prices) lowers them over time: on 2026-10-15 the ECS non-RI round-trip was
> 59/116 because the OS images those cards used were delisted. The golden suite's current output
> is the source of truth.

| Service | Cards round-tripped | Notes |
|---|---|---|
| EVS / CCE / OBS / RDS / ELB / SFS Turbo | 35/35 · 13/13 · 12/12 · 36/36 · 6/6 · 1/1 | field-for-field, to the cent |
| CBR (Backup) | 17/17 | vault + size, on-demand and yearly |
| EIP-less networking: NAT / Cloud Connect (dline) / API Gateway | 1/1 · 4/4 · 2/2 | single on-demand/monthly product |
| WAF / APM / FunctionGraph / DEW (KMS+CSMS) | 4/4 · 2/2 · 4/4 · 4/4 | pay-per-use and usage (request/compute) lines |
| LTS (CloudWatch logs target) | 2/2 | six usage lines |
| ECS non-RI (PPU/monthly/yearly) | 109/111 | 2 = catalog drift (flavor no longer sold); traffic-EIP variant is a documented gap |
| ECS RI (1y/3y) | 448/480 | 32 = RI plan prices changed since the lists were saved (catalog drift) |
| **Total** | **700/734 (95.4%)** | every miss is catalog drift or a documented gap, none are build errors |

Builders: `ecs, evs, cce, obs, rds, sfs, elb, nat, apig, dline, cbr, apm, waf, function, dew, lts, cci, rabbitmq, kafka`.

Still to build (targets for the migration estate): `eip, vpn, sfs (NAS), nosql, dds, dis, aom, hss, ssa, er, dli, eg`. Of these `eip`/`vpn` reference bandwidth specs that the calculator replaced (drift), and the rest have no corpus card yet, so their `addToList_*` label tokens must be recovered from `framework.js` before a card renders correctly.

See `docs/CAVEATS.md` for the full list of pitfalls (Edit-vs-list price, per-service pricing models, region availability/price, the token rule) before adding a builder or a quote.

Run it yourself: `uv run pytest -q -m live tests/test_builders_golden.py`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `AUTH_EXPIRED` | `uv run autocalc login` (silent refresh already tried) |
| `SERVICE_NOT_SOLD` / `SPEC_NOT_FOUND` | the error lists valid regions or the closest specs; use `describe_service`/`search_skus` |
| `REGION_AMBIGUOUS` | pick one of the listed region ids |
| inquiry fails (5xx/timeout) | retried with backoff; run `autocalc doctor` if it persists |
| browser does not open | `uv run autocalc install-browser`, check WSLg (`echo $DISPLAY`) |

## Known caveats and workarounds

See [`docs/CAVEATS.md`](docs/CAVEATS.md). Highlights: the list price and the Edit price are
computed from *different* places (an incomplete ECS render template makes Edit silently drop
data disks); RI cards must carry selected-level aggregates or the UI shows `NaN`; ECS cards
must not carry a default EIP; only ECS/HECS expose a Reserved-Instance plan.
`autocalc validate <shareListId>` checks a saved list for these classes of glitch.

## Security note

The stored session cookie grants access to your Huawei Cloud **account**, not just the
calculator. autocalc keeps it in the keyring when possible, else a `0600` file, never
logs cookie values, and redacts them in errors. Treat `~/.config/autocalc/session.json`
like a password. The legacy repo `.session.curl` is deprecated and imported once, then
deleted.

## Specs and changes (OpenSpec)

How autocalc must behave, including every calculator caveat, is written down as specs in
[`openspec/specs/`](openspec/specs/): `catalog-access`, `rating`, `card-building`,
`saved-lists-and-auth`, `region-availability` and `mcp-surface`. Each requirement has WHEN/THEN
scenarios that map to tests. [`docs/CAVEATS.md`](docs/CAVEATS.md) explains *why* each rule exists.

Behavior changes go through an OpenSpec change in `openspec/changes/<name>/` (proposal, design,
delta specs, tasks):

| Step | Agent command | What it does |
|---|---|---|
| 1 | `/opsx:explore` | think a problem through before committing to a plan (optional) |
| 2 | `/opsx:propose <idea>` | create the change folder with proposal, specs, design and tasks |
| 3 | `/opsx:apply <name>` | implement the tasks, checking them off as it goes |
| 4 | `/opsx:archive <name>` | merge the delta specs into `openspec/specs/` and file the change |

The same commands exist for Claude Code, Codex/agents, Gemini CLI, Copilot and OpenCode. Useful
CLI commands: `openspec list` (open changes), `openspec list --specs`, `openspec view`
(dashboard), `openspec show <name>`, `openspec validate --all --strict`.

## Development

```bash
uv run pytest -q              # unit tests (no network)
uv run pytest -q -m live      # live read-only checks
uv run python tests/render.py # publish a list, open the share link headless, delete it
```
