# Design

## Context

See proposal.md. Existing parts: `validate.validate_list` (arithmetic and shape),
`tests/support/page_rating.rerate` (rating-engine price of a card from its stored products; the
ECS RI rule through `EcsBuilder._price_ri`), `page.edit_check.edit_check` (one result per card,
failures reported not raised), `share.Session` (create, delete) and `share.share_detail`
(anonymous read). Only ECS RI prices through a custom function; every other card prices through
`Builder.price` from fields the card stores.

## Goals / Non-Goals

**Goals:** one function that saves, verifies and either returns a link or deletes; a diff a
human can act on; no way for an agent to bypass it.

**Non-Goals:** speed (see proposal), new surfaces, fixing every service's builder.

## Decisions

### D1. `gate.py` with `verify` and `publish_checked`
`verify(list_id, calc, edit=edit_check) -> list[CardCheck]` reads the list, validates it, rates
each card and runs the Edit check. `publish_checked(name, cards, settlement, session, calc)`
creates the list, calls `verify`, and on success returns `{id, url, cards}`. The Edit check is a
parameter so tests run offline.

### D2. A card passes when four numbers agree
`CardCheck(index, title, stored, rated, edit, problems)`. It passes when `problems` is empty:
no validation issue on that card, `rated == stored`, `edit == stored`, all in cents (`Decimal`).
List-level validation issues (a total that does not match) are attached to the list, and fail
the gate as a whole.

### D3. Rating is generic
`rerate(card, calc)` picks the builder by `serviceCode` and calls `Builder.price` on a copy of
the stored products, or `_price_ri` for ECS RI, exactly as `page_rating` does today. That helper
moves into `gate.py`.

### D4. Everything that can go wrong is a failure, and cleanup is in `finally`
`publish_checked` wraps `verify` so that any exception, including the browser not starting,
counts as failure: the list is deleted (unless kept) and `GateFailed` is raised, with the
original exception as its cause. If the delete raises, the message gains the list id.

### D5. Keep-on-fail is an environment variable
Read once per publish from `AUTOCALC_KEEP_ON_FAIL`. MCP tools and the CLI never take it.

### D6. Rating runs in parallel, the Edit check does not
Rating is a plain read (ADR-0010 allows four in flight); a small thread pool runs it. The Edit
check keeps its single browser context.

## Risks / Trade-offs

- **Slow publishing.** About 15 s per card. Accepted; parallel contexts later.
- **Stricter than before.** Cards that always re-priced wrongly now cannot be published.
  That is the purpose; the error says which card and why.
- **Service coverage of the Edit check is probed, not proven for all 20 builders.** The failing
  closed rule keeps a wrong builder from shipping; each migration proves its own service.
