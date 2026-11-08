# Tasks

## 1. Shard Planning and Shard Summaries (`core/quote-files`)

- [x] 1.1 Wire `partitionResources` into `plan` in `src/core/quote-file.ts` to calculate partition shards for declarative quotes and attach `shards` to the plan result object; verify with `bun test tests/unit/quote-file.test.ts`.
- [x] 1.2 Update CLI output in `src/core/ui.ts` to render partition shard summaries (shard title, card count, estimated wire bytes) when `shards.length > 1`; verify with `bun test tests/unit/quote-file.test.ts`.
- [x] 1.3 Add unit tests in `tests/unit/quote-file.test.ts` verifying that quotes exceeding single-list card (200) or byte (950 KiB) limits calculate partition shards and that single-list quotes remain unsuffixed; verify with `bun test tests/unit/quote-file.test.ts`.

## 2. Multi-Shard Sequential Publishing (`core/quote-files`)

- [x] 2.1 Update `apply` in `src/core/quote-file.ts` to publish each shard sequentially through the publish gate (`publishQuoteTool`), generating isolated drafts and collecting per-shard share links and checks; verify with `bun test tests/unit/quote-file.test.ts`.
- [x] 2.2 Add error handling in `apply` so if shard $k$ fails gate verification, subsequent shards are halted, the failed list is cleaned up by the gate, and published prior shard links are reported; verify with `bun test tests/unit/quote-file.test.ts`.
- [x] 2.3 Update CLI output in `src/core/ui.ts` to render multi-shard apply results with all published shard names and share links; verify with `bun test tests/unit/ui.test.ts` (or `bun test tests/unit/quote-file.test.ts`).
- [x] 2.4 Add unit and integration tests in `tests/unit/quote-file.test.ts` simulating multi-shard apply and asserting sequential calls, titling (`- Part 1`, `- Part 2`), and consolidated result structure; verify with `bun test tests/unit/quote-file.test.ts`.

## 3. Lockfile Partition Persistence (`core/declarative-compiler`)

- [x] 3.1 Pass calculated shards into `generateLockfile` during `plan` and update `apply` to persist published `share_id` and `share_link` on each locked shard in `quote.lock.yaml`; verify with `bun test tests/unit/compiler/lockfile.test.ts`.
- [x] 3.2 Add unit tests in `tests/unit/compiler/lockfile.test.ts` and `tests/unit/quote-file.test.ts` verifying that `quote.lock.yaml` preserves multi-shard metadata and share links across plan/apply cycles; verify with `bun test tests/unit/compiler/lockfile.test.ts`.

## 4. Documentation

- [x] 4.1 Update `docs/reference/quote-files.md` with multi-list partitioning details: wire limit (<950 KiB), card limit (200), deterministic shard titling (`- Part N`), lockfile `shards` structure, and sequential publishing behavior; verify with `bun run docs:build`.
- [x] 4.2 Verify docs strict build succeeds with zero dead links or warnings via `bun run docs:build`.

## 5. Verification and Integration

- [x] 5.1 Run full TypeScript typecheck and boundary validation: `bun run check && bun run check:boundaries`.
- [x] 5.2 Run complete offline test suite: `bun test:offline`.

## Workflow follow-up

- Archive the change after review requirements are satisfied (`openspec archive multi-list-partitioning`).
- Verify the archived directory under `openspec/changes/archive/`.
- Commit changes and push to `origin/main` to let `.githooks/pre-push` evaluate release bump.
