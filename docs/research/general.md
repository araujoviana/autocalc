# General Calculator SPA Architecture & Quirks

This document consolidates cross-cutting discoveries and vendor Single-Page Application (SPA) behaviors observed on the Huawei Cloud Pricing Calculator (`CBC-PortalCalculator`).

For background on how AutoCalc encodes and verifies quotes, see:
- [Page as Encoder](../explanation/huawei/page-encoder.md)
- [The Fail-Closed Publish Gate](../explanation/huawei/publish-gate.md)
- [Edit vs. List Price](../explanation/huawei/edit-vs-list-price.md)
- [Browser Session Model](../explanation/huawei/sessions.md)

---

## RES-001: Cart Edit Refill & Vue Reactivity

- **Scope**: Core Page Encoder (`src/core/page/`)
- **First Observed**: 2026-11-02 on frontend `11.4.201`
- **Confidence**: **Confirmed Fact** (verified by bundle inspection in `framework.js`)
- **Status**: Handled

### Observation
When a user clicks **Edit** on a saved quote card, the calculator cart attempts to refill the form with the stored `rewriteValue` using `template-render.setValue` (`framework.js#L46080-L46089`).

The framework performs a single comparison between the stored form state and the refilled state on the *very first emission* after Edit starts (`framework.js#L56533-L56537`). Because complex Vue 3 components emit changes asynchronously during cascade initialization, this comparison frequently trips before child controls have finished settling, popping an alert dialog warning of "unmatched parameters".

### Practical Implication
The browser popup is a race condition in the vendor's frontend, not evidence of real price drift. Dismissing or ignoring this dialog is safe; the true test is whether the form state and rated price match once all reactive cascades have settled.

### AutoCalc Handling
AutoCalc suppresses the vendor's race-detector dialog during automated verification and waits for network and reactive quiescence before inspecting the card.

---

## RES-002: timeTag Pricing Signals

- **Scope**: Rating & Validation (`src/core/page/edit.ts`, `src/providers/huawei/rating.ts`)
- **First Observed**: 2026-11-02 on frontend `11.4.201`
- **Confidence**: **Confirmed Fact**
- **Status**: Handled

### Observation
Every form state emission in the calculator generates a monotonic timestamp identifier (`timeTag`). Outgoing rating requests (`/pricing/rest/calculator/v1/ratings`) include this `timeTag`, and the price display board explicitly discards any incoming rating responses whose tag does not match the latest submitted state (`framework.js#L47414`, `L42062`).

### Practical Implication
Relying on arbitrary sleep timers (e.g., waiting 1.5 seconds) to determine if a price inquiry succeeded produces flaky tests and race conditions. Checking for the completion of the request matching the latest active `timeTag` guarantees determinism.

### AutoCalc Handling
AutoCalc monitors network responses and correlates rating requests with settled form state, eliminating arbitrary sleep timeouts in the core verification engine.

---

## RES-006: Catalog Pricing Anomaly Guard

- **Scope**: Declarative Compiler (`src/core/compiler/circuit-breaker.ts`)
- **First Observed**: 2026-11-04
- **Confidence**: **Confirmed Fact** (detected live in upstream catalog)
- **Status**: Handled

### Observation
The upstream Huawei Cloud pricing catalog occasionally contains pricing anomalies where a service's 1-year package price is greater than 11.5 times the 1-month price (in some defective entries, 1-year is priced at 12x or higher, negating annual discounts).

### Practical Implication
Customers selecting yearly commitments expect standard discounts (~10x monthly). Unchecked, declarative planning would lock in an inflated price.

### AutoCalc Handling
`autocalc plan` executes an offline anomaly guard across all resolved yearly SKUs. If the ratio exceeds 11.5x, the compiler flags the card with a warning:
```
[warning] Catalog pricing anomaly detected for <service>: yearly price is > 11.5x monthly.
```
This warning is displayed in plan summaries and passed in MCP tool responses without blocking manual workflows.

---

## RES-007: Kafka Yearly Package Edit Mismatch

- **Scope**: Circuit Breaker & Edit Gate (`src/core/compiler/circuit-breaker.ts`)
- **First Observed**: 2026-11-04 on frontend `11.4.201`
- **Confidence**: **Confirmed Fact** (SPA defect)
- **Status**: Handled (`GH-4-KAFKA-YEARLY-EDIT-DROP`)

### Observation
When a Kafka instance is quoted under a yearly package and saved to a price list, the initial stored price and the rated price agree. However, clicking **Edit** on the saved list fails to reload the selected yearly duration stepper, causing the Edit price to display zero or monthly fallback.

### Practical Implication
The published share link displays the correct yearly total, but standard fail-closed Edit checks would reject the quote due to upstream SPA refill failure.

### AutoCalc Handling
The service is registered in the Known Defect Table (`src/core/compiler/circuit-breaker.ts`). If stored price equals rated price, the publish gate downgrades verification to `RATING_VERIFIED_EDIT_SKIPPED` and emits a warning rather than failing publication.

---

## RES-008: Browser Profile Credential Isolation

- **Scope**: Authentication (`src/core/auth.ts`, `docs/adr/0011-auth-browser-profile-is-the-credential.md`)
- **First Observed**: 2026-11-02
- **Confidence**: **Confirmed Fact**
- **Status**: Enforced

### Observation
During early development, credentials were simultaneously exported to OS keyrings (`secret-tool`, macOS `security`) and parsed from local `.session.curl` files. This caused state desynchronization, permission issues, and secret leakage.

### Practical Implication
The persistent Chromium browser profile directory (`~/.local/share/autocalc/browser-profile`) is the single source of truth for session cookies.

### AutoCalc Handling
In accordance with ADR-0011, all OS keyring integrations and cURL import paths have been removed. Browser contexts lease credentials directly from the isolated browser profile directory, and `autocalc logout` wipes the profile cleanly.

---

## RES-009: Pre-push Automated Versioning

- **Scope**: Tooling / Release (`scripts/bump-version.ts`, `.githooks/pre-push`)
- **First Observed**: 2026-11-08
- **Confidence**: **Confirmed Fact**
- **Status**: Implemented

### Observation
Prior to version `0.4.0`, code commits accumulated on `main` without updating `package.json` or tagging releases, causing users of `autocalc update` (which tracks git release tags per ADR-0019) to remain on stale versions.

### Practical Implication
Releasing must be continuous and tied to change scope.

### AutoCalc Handling
A git `pre-push` hook analyzes outgoing commits using Conventional Commits. Pushing to `main` automatically computes semantic increments, updates `package.json`, commits `chore(release): vX.Y.Z`, tags `vX.Y.Z`, and pushes both branch and tag to remote.
