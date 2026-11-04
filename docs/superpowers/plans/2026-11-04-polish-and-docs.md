# CLI polish, plan safety and doc cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Make the declarative quote path (`plan-quote` → `apply-quote`) readable and safe in a terminal, then make the docs describe only what exists.

**Architecture:** Progress is a process-level sink in `src/core/progress.ts` that the CLI turns on only for a terminal and the MCP server never turns on, so JSON, pipes and MCP are unchanged. Result and plan rendering stay in `quoteView` (`src/core/ui.ts`). The ECS image match is extracted so `plan` and the card builder share one rule.

**Tech Stack:** TypeScript on Bun, `bun test`, `bun run check`, `bun run check:boundaries`.

**Spec:** `openspec/specs/core/declarative-compiler/spec.md`, `docs/reference/errors.md` ("Writing errors"), ADR-0018.

## Global Constraints

- Error text follows `docs/reference/errors.md` "Writing errors": message says what failed, hint says what to do, details are machine fields.
- `--json`, piped stdout and MCP output must not change shape. Progress goes to stderr and only when stderr is a TTY.
- Nothing touches the user's existing saved lists. Tests use fakes; live runs only create lists named `[autocalc] ...` and say so.
- Do not commit unless the user asks.

## Review Focus

- A quote with two lists of the same name: the warning appears, the publish still happens.
- ECS card with no `options.image` in a region where the default matches several images: `plan` flags it, `apply` refuses before opening a browser.
- Progress with `--json` or a piped stderr: nothing extra is written.
- A card whose image is named exactly: no false warning.
- Windows terminals without glyphs: the ASCII fallback of `status()` is used.

---

### Task 1: Progress sink

**Files:** Create `src/core/progress.ts`, `tests/unit/progress.test.ts`; Modify `src/cli.ts`, `src/core/quote-file.ts`, `src/core/publish.ts`, `src/core/gate.ts`

**Interfaces:**
- Produces: `progress(message: string): void` (no-op unless a sink is set) and `setProgress(sink: ((message: string) => void) | null): void`.

- [ ] Test: with a sink set, `progress("a")` calls it with `"a"`; after `setProgress(null)` it does nothing; a throwing sink never propagates.
- [ ] Implement `src/core/progress.ts` with those two functions.
- [ ] In `main` of `src/cli.ts`, call `setProgress` with a writer to stderr only when stderr is a TTY and `--json` is off (use `ui.fancy(process.stderr)`); reset it in `finally`.
- [ ] Emit lines: `apply` in `quote-file.ts` ("Planned N cards"), per-card encode in `publish.ts` ("Encoding card i/N in the calculator page"), `publishChecked` in `gate.ts` ("Saved list <id>; checking stored, rated and Edit prices"), end of `publishChecked` ("Checks passed"/none on failure).
- [ ] Run `bun test tests/unit/progress.test.ts tests/unit/ui.test.ts` → pass.

### Task 2: Apply result table

**Files:** Modify `src/core/ui.ts` (`quoteView`, `apply-quote` branch), `tests/unit/ui.test.ts`

- [ ] Test: `ui.quoteView("apply-quote", {url, name, checks:[{title:"web", stored:"140.54", rated:"140.54", edit:"140.54", ok:true}], warnings:["w"]}, tty)` contains a `CARD  STORED  RATED  EDIT` table row for `web`, the `✓ Published` line, the URL on its own line, and the warning.
- [ ] Implement: reuse `table()`; one `ok`/`fail` status line after it; print `warnings` as `warn` status lines; plain (non-fancy) output stays the JSON it is today.
- [ ] Run `bun test tests/unit/ui.test.ts` → pass.

### Task 3: `plan` flags an ambiguous image

**Files:** Modify `src/core/services/ecs.ts` (extract `matchImages`), `src/core/quote-file.ts` (`plan`, `apply`), `src/core/ui.ts` (`plan-quote` notes), tests in `tests/unit/`

**Interfaces:**
- Produces: `matchImages(images: Dict[], family: string, image: string): Dict[]` exported from `ecs.ts`; plan rows gain `image_choices?: string[]` (only when ambiguous).

- [ ] Test (fake `ctx.catalog.productInfo` returning two AlmaLinux images): plan row for an ECS card with `options.image: "AlmaLinux"` has `image_choices` listing both names; with `"AlmaLinux 9.0 64bit"` it has none.
- [ ] Extract the existing match/exact-match logic in `ecs.ts` into `matchImages` and call it from the builder (behavior unchanged; existing ECS tests stay green).
- [ ] In `plan`, for ECS cards with a decided spec, call `ctx.catalog.productInfo("ecs", region)` and set `image_choices` when `matchImages` returns more than one. Default image comes from the schema default for `image`.
- [ ] In `apply`, throw `invalid("Card '<id>' matches several images: ...", "image", choices)` before publishing.
- [ ] In `quoteView` add the note `image is ambiguous: set options.image` and count it in "need attention".
- [ ] Run the new tests plus `bun test tests/unit` → pass.

### Task 4: Duplicate list-name warning

**Files:** Modify `src/core/quote-file.ts` (`apply`), `tests/unit/` (quote-file test)

- [ ] Test (fake `ctx.lists` returning one list with the same name): `apply` still publishes and the result carries `warnings: ["A list named \"X\" already exists (id ...); this created another."]`; no warning when names differ.
- [ ] Implement: before publishing, call the lists reader already used by the `lists` command; compare names exactly; a failure to list is ignored. Emit `progress()` with the same sentence.
- [ ] Run the test → pass.

### Task 5: Repo hygiene

**Files:** Modify `tests/unit/compiler/cli-integration.test.ts`; delete untracked `src/autocalc/`

- [ ] Give the two CLI integration tests a 30 s timeout (each takes about 2.6 s alone and times out under a loaded suite).
- [ ] `rm -rf src/autocalc` (only `__pycache__`; confirm `git ls-files src/autocalc` is empty first).
- [ ] Run `bun run check`, `bun run check:boundaries`, `bun test tests/unit tests/integration` → only known timing flakes, if any.

### Task 6: Docs say what exists

**Files:** Modify `docs/roadmap.md`, `docs/explanation/architecture.md`, `docs/how-to/audit-remediation.md`, `docs/tutorials/first-quote.md`, `docs/reference/quote-files.md`, `openspec/changes/research-knowledge-and-mcp-workflow/*`; Move `openspec/changes/card-schema` to `archive/` if `openspec` can do it cleanly; Create `docs/handoff.md`; Modify `mkdocs.yml`

- [ ] Roadmap: rewrite the table to the real order (migration, yaml-spec done) and keep "Open items" accurate.
- [ ] `architecture.md`: drop "Today's code is the bottom-left box"; describe the TypeScript layers and the compiler layers from `yaml-spec/design.md`.
- [ ] `audit-remediation.md`: replace "Python remains canonical" with the ADR-0017 outcome.
- [ ] Tutorial: install with Bun, the `plan-quote` → `apply-quote` flow, the image option.
- [ ] `quote-files.md`: status accepted; the lock file name the code writes.
- [ ] Research change: replace `uv run --group docs mkdocs` with the current docs command.
- [ ] Archive `card-schema` (all tasks checked).
- [ ] `docs/handoff.md`: current state, what is verified live, open items with links, in one page; add to `mkdocs.yml`.
- [ ] Verify: grep `docs/` for `uv `, `pytest`, `Python canonical` leaves only history (ADRs, archive).

### Task 7: Live check

- [ ] With the user's go-ahead for a write: run `plan-quote` and `apply-quote` on the scratch quote; confirm progress lines, the result table and (second run) the duplicate warning. Delete only lists this plan created, and only after the user confirms.
