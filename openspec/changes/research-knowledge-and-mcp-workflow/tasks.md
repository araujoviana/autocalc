# Tasks

## 1. Research structure and evidence

- [ ] 1.1 Inventory existing Huawei explanations and audit findings, noting source, date, implementation scope and privacy; verify the inventory distinguishes confirmed facts from hypotheses and identifies gaps.
- [ ] 1.2 Create the research index and general page with cross-links to canonical explanations and evidence metadata; verify each link resolves and each finding states its scope and confidence.
- [ ] 1.3 Create the OBS research page from sanitized evidence, checking current implementation applicability and identifying unresolved behavior; verify no claim treats the TS snapshot as proof of Python behavior and no private data or unavailable local-only link is included.
- [ ] 1.4 Add other service pages where existing evidence supports them and list uncovered services as gaps in the index; verify each page contains traceable sources and status.
- [ ] 1.5 Add research to MkDocs navigation and the docs landing page; verify `uv run --group docs mkdocs build --strict` succeeds.

## 2. Workflow and maintenance

- [ ] 2.1 Add MCP-first guidance to a linked tutorial or how-to, covering discovery, draft/revise/publish, warnings and appropriate research scripts; verify it matches the current registry and ADR-0007 without bypassing ADR-0003.
- [ ] 2.2 Add a contributor checklist for sanitized evidence, scope, verification, cross-links and separately proposed capability gaps; verify a contributor can follow it from the research index.

## 3. Integration review

- [ ] 3.1 Run `uv run --group docs mkdocs build --strict` and review new pages and links for accuracy, privacy and consistency with existing specs and ADRs; verify the build succeeds and review findings are resolved.
