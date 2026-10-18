## Why

20 of the 93 quotable services are verified; the v1 target is 47. Wave 2 is the next 13, all
databases and storage (gaussdb, rdsformariadb, taurusdb, hrds, redis, memcached, dds, ddm, drs,
sfs, dss, sdrs, des). None of them has a Python builder, and writing 13 builder classes would
copy catalog plumbing the page already does. Each calculator page lists its own controls
(`describe` returns id, kind and option values), so a service can be described by a small data
recipe and filled by the existing driver.

## What Changes

- A **form recipe** per service: a data file mapping option names to the page's control ids
  (plus fixed choices), read by one generic builder. No catalog card is built; the page builds it.
- `autocalc page-controls <service>` prints the controls a page offers (id, kind, option
  values), so a recipe is written from the page, not guessed, and the user can see what changed.
- The 13 wave-2 services are encoded through recipes, run live in every billing mode they sell
  (stored = Edit = rating), and added to `VERIFIED` with the frontend version.
- A service whose form cannot be replayed, or whose Edit price differs, moves to *later* in
  `docs/explanation/v1-scope.md` with the reason. Waves are an order of work, not a promise.
- The user is told when the page changes: the existing frontend-version warnings apply to recipe
  services unchanged, and an encode that fails names the control that disappeared.

Out of scope: wave 3, multi-region lists, AZ handling, mapping ranked catalog specs onto recipe
options (recipe services publish from `options` only, like kafka and cce), the update notice.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `huawei/page-encoding`: services without a builder are encoded from a declared form recipe; a page-controls listing.
- `mcp-surface`: `publish_quote` accepts recipe services on the verified list.

## Impact

- New `services/forms.py` + recipes, `page-controls` CLI command, `VERIFIED`, `spa_matrix.py`
  WAVE2, docs (`v1-scope.md`, `cli.md`, ADR-0001 result table, roadmap).
- Publish gate: unchanged. Recipe cards go through the same gate and the same Edit check.
