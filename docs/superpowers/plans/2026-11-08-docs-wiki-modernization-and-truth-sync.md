# Documentation Modernization, Wiki Architecture & Codebase Truth Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the `autocalc` documentation into an interactive, high-performance wiki with automated GitHub Pages deployment, fix all factual discrepancies to ensure 100% technical truthfulness with the codebase, and elevate the UI/UX, readability, and user journey.

**Architecture:** Modernize MkDocs Material with instant SPA navigation, tags, git revision timestamps, breadcrumbs, tabbed code snippets, and collapsible technical schemas; add automated GitHub Pages publishing via `.github/workflows/docs.yml` orchestrated by Bun and `uv`; eliminate all 20 orphan ADR pages and sidebar clutter; synchronize documentation and explanations with current TypeScript/Bun code in `src/`.

**Tech Stack:** MkDocs Material, `uv` (ephemeral cached Python environment), Bun 1.4.4, TypeScript, Mermaid, GitHub Actions (`actions/deploy-pages@v4`).

**Spec:** Synthesized findings from 4-agent documentation review (Codebase Veracity Auditor, UI/UX Reviewer, Wiki/GH Pages Specialist, Comprehensibility Reviewer).

## Global Constraints

- Retain MkDocs Material and keep npm/Bun runtime dependencies (`@modelcontextprotocol/sdk`, `commander`, `playwright`, `zod`) decoupled from Python documentation tools.
- Strict build verification: `mkdocs build --strict` must pass with exit code `0` and zero warnings.
- Documentation must strictly represent `autocalc` version `0.3.0` and its 51 schemas (41 `VERIFIED`, 10 `ACCEPTED_DEFAULT_ONLY`).
- Preserve existing working code in `src/`; changes in this plan are restricted to documentation, documentation generators, CI workflows, and `package.json` scripts.

## Review Focus

1. **Strict Link Integrity**: Verify that adding 20 ADRs and reorganizing `mkdocs.yml` nav results in 0 broken links and 0 unlisted orphan pages.
2. **Dynamic Generation Consistency**: Verify that `scripts/generate-service-docs.ts` outputs valid MkDocs Material markdown (tabs and details syntax) that builds cleanly.
3. **Factual Accuracy**: Verify that environment variables (`AUTOCALC_DATA`), exit codes, and concurrency defaults in `docs/reference/cli.md` match `src/core/config.ts` and `src/core/publish.ts`.
4. **Mobile & Desktop Rendering**: Verify that navigation tabs and collapsible blocks render without layout clipping or horizontal overflow.
5. **CI/CD Reliability**: Verify that `.github/workflows/docs.yml` properly checks out full git history for git revision dates, runs `docs:generate`, and deploys via GitHub Actions Pages.

---

### Task 1: Codebase Veracity & Technical Truth Corrections

**Files:**
- Modify: `docs/reference/cli.md`
- Modify: `docs/reference/errors.md`
- Modify: `docs/explanation/huawei/publish-gate.md`
- Modify: `docs/explanation/huawei/card-rules.md`
- Modify: `docs/explanation/v1-scope.md`
- Modify: `docs/status.md`

- [ ] **Step 1: Update CLI Reference (`docs/reference/cli.md`)**
  - Add `--headed` to Global Options (from `src/cli.ts#L147`).
  - Document `autocalc completion [shell] [target] --install` (from `src/cli.ts#L248-L263`).
  - Add `AUTOCALC_DATA` (`~/.local/share/autocalc`) as the directory holding drafts, run records, and browser profiles (from `src/core/config.ts#L15`). Clarify that `AUTOCALC_CONFIG` holds sessions and update cache.
  - Correct `AUTOCALC_ENCODE_WORKERS` default from `6` to `3 (or CPU/RAM budget)` (from `src/core/publish.ts#L39`).
  - Document `AUTOCALC_PAGE_HEADED` and `AUTOCALC_SCHEMA_DIR`.
  - Add an **Exit Codes** table:
    - `0`: Success (all checks passed).
    - `1`: Check failure / verification failure (`validate`, `edit-check`, `render-check`, `doctor` with `ok: false`).
    - `2`: Validation error, syntax error, or CLI exception (`CalculatorError`).
    - `130`: Interrupted via SIGINT (Ctrl+C).
    - `143`: Terminated via SIGTERM.
  - Document stdout/stderr contract: JSON/human output to `stdout`, errors and interactive status messages to `stderr`.

- [ ] **Step 2: Correct Errors Reference (`docs/reference/errors.md`)**
  - Remove the obsolete warning box at lines 50–54 claiming that `CBC.6006` appears in the `.error` field. Note that `CalculatorError.toJSON()` returns normalized error classes (`SPEC_NOT_FOUND`), with upstream codes retained under `details.exceptionId`.

- [ ] **Step 3: Update Backend Explanations (`docs/explanation/huawei/publish-gate.md` and `card-rules.md`)**
  - In `publish-gate.md`: Remove the claim that parallel browser contexts are a "later optimization". Document that `src/core/publish.ts` encodes cards concurrently using `mapLimit` up to `AUTOCALC_ENCODE_WORKERS`.
  - In `card-rules.md`: Update single-quantity services list to match `SINGLE_QUANTITY` in `src/core/services/publication.ts` (`nat`, `obs`, `lts`, `function`, `elb`, `cci`, `nosql`).

- [ ] **Step 4: Update Scope & Status Metrics (`docs/explanation/v1-scope.md` and `docs/status.md`)**
  - In `v1-scope.md`: Update `function`, `lts`, `eip`, `vpcep`, `vpn`, `cfw`, `hss`, and `maas` from "blocked pending verification" to "verified publishable".
  - In `status.md`: Bump version to `0.3.0`, update total schema count to 51 (41 `VERIFIED`, 10 `ACCEPTED_DEFAULT_ONLY`). Replace internal action names `autocalc plan-quote` with `autocalc plan` and `autocalc apply-quote` with `autocalc apply`.

- [ ] **Step 5: Verify text edits**
  - Inspect git diff across modified docs to ensure changes are accurate and clean.

---

### Task 2: Content Comprehensibility, Value Proposition & User Journey Polish

**Files:**
- Modify: `docs/index.md`
- Modify: `README.md`
- Modify: `docs/tutorials/first-quote.md`
- Modify: `docs/how-to/run-tests.md`

- [ ] **Step 1: Elevate Value Proposition & Dual Persona in `docs/index.md` and `README.md`**
  - Add the "Why autocalc?" comparison matrix (Manual Web UI vs Generic Estimators vs autocalc) explaining why an official share link is required for enterprise procurement and partner deal registration.
  - Frame the two first-class personas upfront:
    1. **AI Agents (Claude Code, Cursor, Windsurf via MCP)**: Automated architecture pricing and verified link delivery.
    2. **Cloud Architects & FinOps Engineers (via CLI)**: Rapid catalog search, declarative YAML quotes, offline validation, and multi-quote Excel export.
  - Embed the Mermaid architecture pipeline diagram in `docs/index.md`.

- [ ] **Step 2: Polish "Your First Quote" Tutorial (`docs/tutorials/first-quote.md`)**
  - Step 1: Add callout: `> Note: On headless Linux servers or Docker containers, run autocalc install-browser after installation.`
  - Step 3: Add explicit DSL syntax cheat-sheet: `service:spec[*quantity][@disk_size_gb]`.
  - Step 5: Add sample terminal output snippet showing planned cards and final verified link.
  - Step 7: Provide direct CLI command alongside the AI prompt:
    ```bash
    autocalc export --rows '[{"env":"prod","list":"<url_or_id>"}]' --path quotes.xlsx
    ```

- [ ] **Step 3: Update `docs/how-to/run-tests.md`**
  - Update line 12 from bare `mkdocs build --strict` to `bun run docs:build` or `uv run --with mkdocs-material mkdocs build --strict`.
  - Add a 1-sentence plain-English definition for "golden corpus".

---

### Task 3: MkDocs Material Wiki Configuration & Styling

**Files:**
- Modify: `mkdocs.yml`
- Create: `docs/assets/stylesheets/extra.css`

- [ ] **Step 1: Create `docs/assets/stylesheets/extra.css`**
  - Add `.badge`, `.badge--verified`, and `.badge--default` CSS classes for status pills in light and dark mode.
  - Add responsive table typography and padding rules.
  - Add code tab styling and dark mode contrast tweaks.

- [ ] **Step 2: Update `mkdocs.yml` Theme & Plugins**
  - Set `repo_name: araujoviana/autocalc`, `repo_url: https://github.com/araujoviana/autocalc`, and `edit_uri: edit/main/docs/`.
  - Configure fonts: `text: Inter`, `code: JetBrains Mono`.
  - Add logo: `icon: { logo: material/calculator-variant-outline, repo: fontawesome/brands/github }`.
  - Add palette with `teal` primary/accent for both light and slate schemes.
  - Add features:
    - `navigation.instant`
    - `navigation.instant.prefetch`
    - `navigation.instant.progress`
    - `navigation.tabs`
    - `navigation.tabs.sticky`
    - `navigation.sections`
    - `navigation.indexes`
    - `navigation.path`
    - `navigation.prune`
    - `navigation.top`
    - `toc.follow`
    - `search.suggest`
    - `search.highlight`
    - `search.share`
    - `content.code.copy`
    - `content.code.select`
    - `content.tabs.link`
    - `content.action.edit`
    - `content.action.view`
  - Add Markdown extensions: `pymdownx.details`, `attr_list`, `md_in_html`, Mermaid custom fence in `pymdownx.superfences`, `pymdownx.highlight`, `pymdownx.inlinehilite`, `pymdownx.emoji`.
  - Add plugins: `search`, `tags`, `git-revision-date-localized`, `redirects`.
  - Register `extra_css: [assets/stylesheets/extra.css]`.

- [ ] **Step 3: Reorganize Navigation & Add All 20 ADRs**
  - Restructure top-level nav items into clean tabs:
    - `Overview` (`index.md`, `status.md`, `roadmap.md`)
    - `Tutorials` (`tutorials/first-quote.md`)
    - `Huawei Cloud Provider` (`reference/services/index.md`, and categorized services)
    - `Reference` (`reference/quote-files.md`, `reference/cli.md`, `reference/errors.md`, `reference/huawei-backend.md`)
    - `How-to guides` (`how-to/run-tests.md`, `how-to/refresh-corpus.md`, `how-to/fetch-bundle.md`, `how-to/release.md`, `how-to/audit-remediation.md`)
    - `Explanation` (`explanation/architecture.md`, `explanation/v1-scope.md`, `explanation/core.md`, `explanation/huawei/*`)
    - `Decisions (ADRs)` (`adr/index.md` + all 20 ADRs from `0000` to `0019`)

---

### Task 4: Service Documentation Generator Enhancement

**Files:**
- Modify: `scripts/generate-service-docs.ts`

- [ ] **Step 1: Update YAML Example Generation to Material Tabs**
  - In `scripts/generate-service-docs.ts`, update `renderExamples()` to format as:
    ```markdown
    ## Example Usage

    === "Declarative Quote (`version: '1'`)"

        ```yaml
        ...
        ```

    === "Plain Card (`cards:`)"

        ```yaml
        ...
        ```
    ```

- [ ] **Step 2: Wrap Technical Tables in Collapsible Details Blocks**
  - Wrap the **Portal Control Schema** section in `??? note "Portal Control Schema (autocalc://schema/<service>) — N controls"`.
  - Wrap the **Live Compatibility Replay** section in `???+ check "Live Compatibility Replay (sa-brazil-1) — N scenarios passing"`.

- [ ] **Step 3: Format Status Badges**
  - Render status as `<span class="badge badge--verified">VERIFIED</span>` or `<span class="badge badge--default">DEFAULT_ONLY</span>`.

- [ ] **Step 4: Regenerate Service Documentation**
  - Run: `bun run docs:generate`
  - Verify that all 51 service docs in `docs/reference/services/` are refreshed with the new tabbed/collapsible structure.

---

### Task 5: CI/CD Workflow & Package Scripts

**Files:**
- Create: `.github/workflows/docs.yml`
- Modify: `package.json`

- [ ] **Step 1: Create `.github/workflows/docs.yml`**
  - Trigger on push and PR to `main` modifying docs, schemas, generators, or the workflow.
  - Checkout repository with `fetch-depth: 0` (required for `git-revision-date-localized`).
  - Set up Bun, run `bun install --frozen-lockfile`, and run `bun run docs:generate`.
  - Set up `uv`, and run:
    ```bash
    uv run \
      --with mkdocs-material \
      --with mkdocs-git-revision-date-localized-plugin \
      --with mkdocs-redirects \
      mkdocs build --strict
    ```
  - Deploy to GitHub Pages using `actions/upload-pages-artifact@v3` and `actions/deploy-pages@v4` on `main` push.

- [ ] **Step 2: Add Scripts to `package.json`**
  - Add:
    ```json
    "docs:serve": "bun run docs:generate && uv run --with mkdocs-material --with mkdocs-git-revision-date-localized-plugin --with mkdocs-redirects mkdocs serve",
    "docs:build": "bun run docs:generate && uv run --with mkdocs-material --with mkdocs-git-revision-date-localized-plugin --with mkdocs-redirects mkdocs build --strict"
    ```

---

### Task 6: Strict Build Verification & Whole-Branch Validation

- [ ] **Step 1: Test strict documentation build**
  - Run: `bun run docs:build`
  - Verify: Build completes in ~1-2 seconds with exit code 0 and ZERO warnings.
  - Verify: ADR orphan warnings are completely gone.

- [ ] **Step 2: Run offline test suite and boundary checks**
  - Run: `bun run test:offline`
  - Run: `bun run check:boundaries`
  - Verify: All tests pass.
