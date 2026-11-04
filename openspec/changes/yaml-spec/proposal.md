# Proposal

## Why

Autocalc currently relies on ad-hoc CLI syntax and unstable vendor form semantics, causing complex customer quotations (300+ cards, yearly durations, tiered storage) to require external workaround scripts to handle payload size limits, silent UI stepper clamps, card state leakage, and portal bugs (GitHub Issues #1, #2, #4, #5, #6). Introducing a declarative, decoupled YAML specification (`quote.yaml`) with a deterministic compiler and a 4-tier circuit breaker provides stable, auditable infrastructure-as-code while isolating quotation planning from vendor portal volatility.

## What Changes

- Introduce the stable Declarative YAML Specification (`version: "1"`) featuring `metadata`, `defaults`, `templates` (machine archetypes), `environments`, and `resources` with mandatory physical dimensional units (e.g. `95043 GB`, `150 TB/mo`).
- Create the offline Compiler and Canonical Resource IR (`CanonicalResourceIR`) that validates syntax, normalizes units and durations (8,760h / 365d / 12mo for 1y PPU), and enforces the anti-splitting rule for fixed-base cost services (CCE, NAT, ELB).
- Implement pre-flight payload size and wire budgeting ($\le$ 950 KiB and $\le$ 200 cards per list) with automatic multi-list partitioning and clean unwatermarked list naming ($\le$ 55 characters).
- Build the 4-tier Vendor Circuit Breaker (`FULL_GATE_VERIFIED` $\to$ `RATING_VERIFIED_EDIT_SKIPPED` $\to$ `CACHED_CATALOG_ESTIMATE` $\to$ `EXPORT_ONLY`) that isolates upstream calculator SPA defects (Kafka yearly re-pricing, OBS storage line drop) without failing entire quotations.
- Generate deterministic lockfiles (`quote.lock.yaml`) recording pinned catalog SKUs, rated prices, card partition maps, and generated share links.
- Expose `compile_quote`, `plan_quote`, and `apply_quote` through the CLI and MCP surface.

## Capabilities

### New Capabilities
- `core/declarative-compiler`: Deterministic parser, validator, and compiler for declarative `quote.yaml` files, producing validated `CanonicalResourceIR` and lockfiles with zero vendor UI control coupling.
- `huawei/circuit-breaker`: Resilient 4-tier degradation engine, lean card payload builder (pruning zero lines and unselected plans), and pre-flight payload budgeter protecting against Huawei Cloud portal instability.

### Modified Capabilities
- `huawei/saved-lists`: Enforce maximum list name length of 55 characters and strictly forbid tool watermarking in customer-visible list titles.

## Impact

- **Core Engine**: Adds `src/core/compiler/` for YAML parsing, AST validation, and IR generation.
- **Vendor Layer**: Adds lean card payload builders and circuit breakers under `src/core/huawei/`.
- **CLI & MCP**: Adds `compile-quote`, `plan-quote`, `apply-quote` subcommands and MCP tools.
- **Dependencies**: Uses `yaml` (already standard in Bun/TypeScript) for YAML parsing; zero new native runtime dependencies.
- **Publish Gate**: Unchanged for supported services; circuit breaker provides verified rating fallback when vendor Edit SPA has confirmed defect signatures.
