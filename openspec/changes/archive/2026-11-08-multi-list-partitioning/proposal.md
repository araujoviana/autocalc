# Proposal

## Why

Real-world enterprise infrastructure quotations (e.g., 300+ compute and storage resources) exceed Huawei Cloud's calculator portal limits: HTTP 413 around ~1 MiB of payload JSON and portal DOM crashes beyond ~200 cards per saved list. While `src/core/compiler/wire.ts` already contains the `partitionResources` logic to calculate shards, `autocalc apply` and `autocalc plan` currently route all cards to a single draft, failing on oversized quotations.

Now that the codebase is on TypeScript and version 0.5.0, closing this gap allows large declarative architecture quotes to plan and apply reliably across multiple coordinated saved lists (`Part 1`, `Part 2`, ...) on live authenticated accounts.

## What Changes

- Update `autocalc plan` to detect when a quote partitions into multiple shards, displaying shard boundaries, estimated wire byte budgets, and card counts per partition.
- Update `autocalc apply` to publish multi-shard quotes sequentially through the publish gate, saving each shard as an independent verified list (`<title> - Part 1`, `<title> - Part 2`), verifying each card (stored = rated = Edit), and returning the complete list of share links.
- Update `quote.lock.yaml` to record the partition map and verified share links for all shards.
- Support partial failure cleanup: if shard $k$ fails gate verification, delete shard $k$ and report failure without leaving orphaned unverified lists.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `core/quote-files`: Add requirements and scenarios for planning and applying partitioned quotes across multiple saved shopping lists when card or byte limits are exceeded.
- `core/declarative-compiler`: Update lockfile requirement to record multi-shard partition maps and share link URLs per shard.

## Impact

- **Affected code**: `src/core/quote-file.ts`, `src/cli.ts`, `src/core/compiler/wire.ts`, `src/core/compiler/lockfile.ts`.
- **Publish-Gate Impact**: None on the gate's verification algorithm. Each individual shard passes through the exact same fail-closed publish gate (`stored == rated == Edit`). If any shard fails verification, the gate deletes that list.
- **Out of Scope**: Changing single-list limits on Huawei Cloud's portal, automatic merging of multiple remote lists on the portal, or altering individual service schemas.
