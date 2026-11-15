# Tasks

## 1. Architecture entrypoint and status/roadmap/handoff consolidation

- [ ] 1.1 Create `docs/architecture.md` (1-page code overview, Mermaid diagram of `draft → plan → apply → gate → publish`, concurrency/state table, *"where to touch for X"*, and `bench` / `bench:report` guide) and link it in `mkdocs.yml` and `docs/index.md`; verify `mkdocs.yml` lists the file and offline `docs-contract` passes.
- [ ] 1.2 Assign distinct headers/roles to `docs/status.md` (`v0.7.0`, runtime counts, benchmark summary), `docs/roadmap.md` (single backlog of open items), and `docs/handoff.md` (short resumption pointer without duplicating tables); verify no conflicting release version remains across these three files (`rg -n '0\.[0-9]\.0' docs/status.md docs/handoff.md package.json`).

## 2. Generator, README, explanation sync & live test repair

- [ ] 2.1 Replace hardcoded `40 services` in `scripts/generate-service-docs.ts` with dynamic `VERIFIED.size`, reconcile CCE notes, run `bun run docs:generate`, and extend `tests/unit/docs-contract.test.ts` to assert `docs/architecture.md` indexing and `VERIFIED.size` parity; verify `bun test tests/unit/docs-contract.test.ts` passes.
- [ ] 2.2 Update `README.md` (`version: "1"` syntax, `AUTOCALC_DATA`, `AUTOCALC_ENCODE_WORKERS <= 3`, `bun run bench` / `bun run bench:report`) and update `docs/explanation/core.md` to reflect TypeScript on Bun (`ADR-0017`); verify consistency with `src/cli.ts`, `src/core/publish.ts`, and `tests/unit/docs-contract.test.ts`.
- [ ] 2.3 Fix `tests/live/catalog.test.ts` so `list_regions` is invoked with `{}` per `ListRegionsInput`; verify with `bun run check` (and `AUTOCALC_LIVE=1 bun test tests/live/catalog.test.ts` when a live session is active).

## 3. Final checks

- [ ] 3.1 Run `bun run check && bun run check:boundaries && bun run test:offline` (and `bun run docs:build` if MkDocs/uv is installed) and confirm zero errors.
