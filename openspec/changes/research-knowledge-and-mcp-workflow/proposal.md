# Proposal

## Why

Calculator discoveries are scattered across explanations, audit reports and project-specific scripts. Agents repeatedly rediscover quirks or bypass the supported MCP workflow, so knowledge does not reliably carry over to the next quotation.

## What Changes

- Create a searchable research section with a general index and service-specific pages, linked from the documentation navigation.
- Consolidate relevant existing findings with evidence, observation date or vendor version, confidence, applicability and current AutoCalc handling; preserve unresolved questions and links to source material.
- Document an MCP-first workflow for agents: discover capabilities, use the existing draft/revise/publish workflow, and record gaps for future improvements rather than silently substituting ad hoc scripts.
- Establish a lightweight process for capturing new findings and deciding whether they warrant documentation, a regression test, or a separately scoped MCP enhancement.
- Seed the section from existing public, sanitized evidence, prioritizing the current OBS audit and existing general explanations; do not assert unverified findings as facts.

## Capabilities

### New Capabilities

None. This change documents existing behavior and a research workflow.

### Modified Capabilities

None. No existing product requirement or MCP contract changes.

## Impact

Documentation navigation, research pages and contributor guidance. No runtime API, dependencies, or publish-gate behavior changes. The documented workflow must preserve the existing publish gate and ADR-0007. Out of scope: replacing Python with TypeScript, implementing new MCP tools, changing pricing or gate behavior, and recording customer data. Discovered product gaps become separately proposed changes.
