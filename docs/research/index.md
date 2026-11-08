# Research & Vendor SPA Discoveries

This section documents empirical findings, reverse-engineering discoveries, and behavioral quirks of upstream cloud pricing calculators (primarily Huawei Cloud's CBC Portal Calculator).

Our goal is to ensure discoveries made during quotation, auditing, or compatibility testing are preserved, traceable, and directly actionable—without bypassing the supported MCP workflow or the publish gate ([ADR-0003](../adr/0003-fail-closed-publish-gate.md), [ADR-0007](../adr/0007-workflow-surface-and-one-registry.md)).

---

## Findings Inventory & Evidence Status

Every finding is recorded with its observation date, frontend calculator version, confidence, scope, and how AutoCalc handles it today:

| ID | Topic / Service | Scope | Date / Version | Status / Confidence | AutoCalc Handling |
|---|---|---|---|---|---|
| **RES-001** | [Cart Edit Refill & Vue Reactivity](general.md#res-001-cart-edit-refill-vue-reactivity) | Core / Page | 2026-11-02 (`11.4.201`) | **Confirmed Fact** | The portal only checks rewrite values on the first emission. AutoCalc ignores the spurious dialog and re-reads the form state after settling. |
| **RES-002** | [Deterministic Pricing Tag (`timeTag`)](general.md#res-002-timetag-pricing-signals) | Core / Rating | 2026-11-02 (`11.4.201`) | **Confirmed Fact** | The calculator discards rating responses whose `timeTag` is stale. AutoCalc waits for rating settling rather than fixed arbitrary timeouts. |
| **RES-003** | [OBS Pay-per-use Storage Drop](huawei/obs.md#res-003-cascaded-control-rewrite-drop) | OBS | 2026-11-02 (`11.4.201`) | **Confirmed Fact** (SPA defect) | `changeNextStatus` clears pending rewrite on momentarily empty cascaded sources. Handled via `GH-2-OBS-STORAGE-EDIT-DROP` circuit-breaker tier (`RATING_VERIFIED_EDIT_SKIPPED`). |
| **RES-004** | [OBS Multi-AZ & Step Ordering](huawei/obs.md#res-004-stepper-order-and-multi-az-replay) | OBS | 2026-11-07 (`11.4.201`) | **Confirmed Fact** (Fixed) | Controls must be populated in dependency order (`storageType_switch` before steppers). Fixed in `src/core/services/obs.ts`. |
| **RES-005** | [OBS Delete vs Transition Swapped Measures](huawei/obs.md#res-005-delete-vs-transition-measure-swap) | OBS | 2026-11-07 (`11.4.201`) | **Confirmed Fact** (Fixed) | Page `Request_stepper4` is delete requests (measure 31), `Request_stepper5` is lifecycle transition (measure 14). Fixed in `src/core/services/obs.ts`. |
| **RES-006** | [Upstream Yearly Catalog Anomaly Guard](general.md#res-006-catalog-pricing-anomaly-guard) | Catalog | 2026-11-04 | **Confirmed Fact** | Vendor catalog occasionally lists yearly prices > 11.5x monthly. Flagged offline in `autocalc plan` by the anomaly guard. |
| **RES-007** | [Kafka Yearly Package Edit Mismatch](general.md#res-007-kafka-yearly-package-edit-mismatch) | Kafka | 2026-11-04 (`11.4.201`) | **Confirmed Fact** (SPA defect) | Vendor cart edit drops yearly package selection on reload. Routed to `RATING_VERIFIED_EDIT_SKIPPED` when stored and rated prices match. |
| **RES-008** | [Credential Isolation & Browser Profile](general.md#res-008-browser-profile-credential-isolation) | Auth / Session | 2026-11-02 | **Confirmed Fact** (Enforced) | ADR-0011 removed OS keyring and cURL parsing. Persistent browser context in user config directory is the single source of truth. |
| **RES-009** | [Pre-push Automated Semver Propagation](general.md#res-009-pre-push-automated-versioning) | Tooling / Release | 2026-11-08 | **Confirmed Fact** (Implemented) | Conventional Commits determine semantic version increments before pushing to `main`, auto-tagging and pushing `vX.Y.Z`. |

---

## Research Documents

- **[General Architecture & SPA Quirks](general.md)**: Frontend framework lifecycle, `timeTag` pricing, session isolation, and catalog anomaly detection.
- **[Huawei OBS Service Research](huawei/obs.md)**: Deep dive into Object Storage Service storage classes, tiered traffic splitting, stepper limits, and cart Edit quirks.
- **[In-Depth Audit Review (2026-11-02)](audit-review.md)**: Security, credential isolation, and parity analysis during the TypeScript cutover.
- **[Edit Verification Design (2026-11-02)](edit-verification.md)**: Detailed source analysis of `CBC-PortalCalculator/11.4.201` cart and template-render logic.
- **[Compatibility Audit (2026-11-07)](compat-audit-2026-11-07.md)**: Live replay matrix across billing modes, usage factors, and regional availability.

---

## Service Coverage & Research Gaps

All 51 supported services are mapped in `src/schema/files/*.yaml` (41 `VERIFIED`, 10 `ACCEPTED_DEFAULT_ONLY`). Detailed empirical SPA research notes currently exist for:
- **OBS** (Object Storage Service): fully documented in [OBS Research](huawei/obs.md).
- **Core / Common**: documented in [General Research](general.md).

### Research Gaps (Uncovered Services)
The following complex services currently have automated live compatibility tests (`docs/compat/<service>.md`) but have not yet had isolated SPA framework decompilation notes written:
- **EIP** (Elastic IP): Traffic-based bandwidth stepping and shared bandwidth group dynamics.
- **VPN** (Virtual Private Network): Gateway connection groups vs non-fixed IP configuration state.
- **LTS** (Log Tank Service): Cold storage and hot retention interaction on live cart reload.
- **CCE & CCI** (Cloud Container Engine & Instance): Node flavor scaling and addon cluster steppers.
- **Remaining 10 Default-Only Services** (`aad`, `cc`, `dbss`, `dsc`, `edgesec`, `esw`, `ga`, `hecs`, `reliability`, `ucs`): Awaiting full option parameterization research.

---

## Contributor Checklist for New Research

When uncovering a new calculator quirk, SPA defect, or unexpected behavior:

1. **Check Existing Docs & ADRs**: Search `docs/research/`, `docs/explanation/huawei/`, and `docs/adr/` before filing a duplicate.
2. **Sanitize Everything**: **Never** include real customer names, tenant IDs, credentials, cookies, or private saved-list IDs. Use generic identifiers (`Example Corp`, `sa-brazil-1`).
3. **Record Version & Environment**: Record the calculator frontend version (visible in `autocalc doctor`), the observation date, and the tested region.
4. **Distinguish Facts from Hypotheses**: State clearly what was directly observed vs. what is inferred.
5. **Traceability**: Note exact schema controls (`calculator_*`), network request endpoints (`/pricing/rest/...`), or line numbers in the public bundle.
6. **Propose Solutions via OpenSpec**: Research documents describe reality; product enhancements, schema changes, or circuit breaker additions must be proposed as separate OpenSpec changes.
