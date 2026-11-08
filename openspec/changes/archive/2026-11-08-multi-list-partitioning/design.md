# Design

## Context

See `proposal.md`.
`src/core/compiler/wire.ts` contains the pure partitioning algorithm `partitionResources(resources, titlePrefix, maxCards, maxBytes)` which splits canonical IR resources into shards respecting the 200-card and 950-KiB wire limits.
Currently, `src/core/quote-file.ts` flattens all physical cards into a single draft and single publish call.
This design wires the existing partitioner into `plan` and `apply`.

## Goals / Non-Goals

**Goals:**
- Provide seamless, automatic partitioning for large enterprise quotes in both CLI (`autocalc plan`, `autocalc apply`) and MCP tools (`plan_quote`, `apply_quote`).
- Output shard partition summaries in `plan` when multiple shards are detected.
- Sequentially publish and verify each shard through the fail-closed publish gate in `apply`, recording each share link.
- Update `quote.lock.yaml` to record partition maps and share link URLs.

**Non-Goals:**
- Do not bypass or relax the publish gate (`stored == rated == Edit`).
- Do not split fixed base cost resources (the anti-splitting rule in `src/core/compiler/anti-split.ts` remains strict).
- Do not alter single-card stepper limits.

## Decisions

### 1. Shard Identification and Titling
- Single-shard quotes retain their unsuffixed title (e.g., `Acme Prod Web`).
- Multi-shard quotes generate deterministic numbered suffixes via `sanitizeTitle`:
  `<title> - Part 1`, `<title> - Part 2`, etc., clamped to 55 characters max.
- Titles stripped of `autocalc` branding for user cleanliness.

### 2. Sequential Publish-Gate Execution
- In `apply()`, iterate over shards sequentially.
- For each shard:
  1. Construct an isolated draft with the shard's physical cards.
  2. Invoke `publishQuoteTool(ctx, { draft_id, name: shard.title, ... })`.
  3. The fail-closed gate verifies each card in that shard (stored = rated = Edit).
  4. On success, store the share link and list ID on the shard record.
  5. If shard $k$ fails gate verification, the gate deletes shard $k$, halts further publishing, and throws `CalculatorError("GATE_FAILED", ...)`, reporting successfully published prior shards.

### 3. Comprehensive Lockfile Pinned State
- Update `generateLockfile` and `quote.lock.yaml` serialization:
  - When $>1$ partitions exist, serialize `partitions: [...]` containing `index`, `title`, `card_count`, `estimated_bytes`, and optional `url`.
  - When 1 partition exists, retain the standard single-list format.

## Risks / Trade-offs

- **[Extended Run Duration]** → Sequential publishing across 200+ cards takes 1–2 minutes of headless browser time.
  *Mitigation*: Emit real-time progress events per card and per shard (`Publishing Shard 1/2... Encoding card X/Y`).
- **[Partial Network Interruption]** → Network drop between Shard 1 and Shard 2 could leave Shard 1 published while Shard 2 is not.
  *Mitigation*: Prior shards remain valid and recorded in the lockfile; re-running `apply` can identify already-published shards.
