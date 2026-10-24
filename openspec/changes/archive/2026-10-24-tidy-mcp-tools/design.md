## Context

Row shape comes from `Sku.as_dict()`, which the CLI and the draft ranking also use. The change
sits in the MCP tool, so those callers keep their shape.

## Decisions

- Flatten in `search_skus` only. Dropping the `Remark`, `Spot Duartion` and `Spot Duration`
  fragments of the description (they are the same on every row) is a fixed list, not a parser.
- Keep rows as JSON objects, not tabular text: ADR-0008's tabular format would change the
  return type for every client and saves less than flattening already does.

## Risks

Clients written against the nested `prices`. None are released.
