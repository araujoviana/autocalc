# Display tokens

*Specs: `huawei/card-encoding` › Label tokens come from the target region*

Card labels are opaque tokens, not text: `addToList_title`, `addToList_product`, `specName`,
`storageType`, `architectureName`, `measureId`. They are **per region and catalog**.
Hard-coding a token from one region caused an OBS Edit bug in another (see
[Card rules](card-rules.md#obs-prepaid-packages)).

## Where tokens come from

- The target region's own catalog (`productInfo`).
- For global labels, the service config bundle:
  `GET /config?urlPath=<service>&language=en-us&sign=common`. The bundle also holds non-obvious
  pricing constants, such as the DMS conversion-rate maps.
- The frontend bundle is the source of truth for the whole render model. Fetch it with
  `uv run python scripts/fetch_bundle.py` ([how-to](../../how-to/fetch-bundle.md)); it is never
  committed.

## Services without a known card

For a service that has never been saved in a real list, the `addToList_*` tokens are unknown.
**Don't guess them.** Recover them from the bundle or the service config, then verify by
publishing a card and reading it back. The page encoder removes this problem: the page fills
in its own tokens.

## Version labels

A label can lag or lead the real product. For example, the calculator's newest PostgreSQL token
renders as **18** and there is no 17 token, so a PostgreSQL 17 requirement shows as PG 18. The
RDS price line does not depend on the engine version.
