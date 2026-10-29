# Design

## Context

See the proposal. The MkDocs navigation already separates explanation, reference and ADRs; Huawei observations are scattered across explanation pages and a local audit. ADR-0007 defines the supported workflow and ADR-0003 the publish gate. The audit describes a TS snapshot, so it cannot be treated as proof of current Python behavior.

## Goals / Non-Goals

**Goals:** Make observations discoverable by service and useful during a quotation; retain their provenance and distinguish established behavior from hypotheses and version-specific findings.

**Non-Goals:** Expose research as a new MCP tool, modify tool behavior or replace existing specifications and ADRs.

## Decisions

1. Add `docs/research/index.md`, `docs/research/general.md` and `docs/research/huawei/<service>.md` for services with evidence; add them to MkDocs navigation and link from the docs landing page. Use an index rather than empty pages for every service. Cross-link existing explanations instead of copying whole pages, to reduce drift. Leave room for other providers.
2. Each finding includes its observation and practical implication, service and scope, date and calculator version where known, evidence link or reproducible sanitized method, confidence/status, affected implementation revision, and current handling or an explicit unknown. Separate confirmed observations, hypotheses, fixed issues, and unresolved issues. Never infer a fix from an old report. Omit customer data, credentials, and private saved-list contents; sanitize and check sources before linking or incorporating them.
3. Seed general findings from existing public explanation pages and OBS findings from the local audit after checking each against the current implementation and recording whether it applies to Python, the TS snapshot, or is unknown. Link other evidence where suitable; do not require live authenticated checks or manufacture missing evidence. An audit report may remain local and untracked: extract only sanitized, independently suitable information and avoid links to files unavailable in the published site.
4. Add agent-facing usage guidance in the existing tutorial or a linked how-to: discover supported tools and service options, use draft/revise/publish and inspect returned warnings, and report missing capability or errors. A script may be appropriate for investigation, testing, or unsupported operations; it must not silently bypass the publish gate or be represented as an equivalent verified MCP result. Record a reusable product gap for a separate change.
5. Add a contributor checklist for new findings: search existing pages, capture sanitized evidence and scope, assess current behavior, link tests or issues where available, and propose product changes separately. Documentation improves discoverability but cannot force external agents to follow it; do not claim otherwise.

## Risks / Trade-offs

- [Vendor behavior changes] → Record versions and dates, label stale or unverified claims, and provide a recheck method.
- [Incorrect carryover from TS audit] → Check implementation scope and source evidence; mark unknown where not verified.
- [Duplication] → Link canonical explanations and avoid rewriting established ADRs or specifications.
- [Agent still bypasses MCP] → Place guidance at workflow entry points and document gaps; evaluate any stronger enforcement in a separate change.

## Migration Plan

Add pages and navigation incrementally; preserve existing URLs and explanations. Verify the strict documentation build and review all new material for private data. Revert the documentation change if needed; no runtime migration is involved.
