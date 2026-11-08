# Huawei Distributed Message Service for Kafka Research

- **Service**: DMS for Kafka (`kafka`)
- **Calculator Frontend Version**: `CBC-PortalCalculator/11.4.201`
- **Region Tested**: `sa-brazil-1` (São Paulo)
- **Status**: Handled via Circuit Breaker in AutoCalc (v0.4.0)

This document describes the known vendor single-page application quirk when editing yearly Kafka instances on the Huawei Cloud Pricing Calculator.

---

## RES-007: Kafka Yearly Duration Drop on Edit

- **Scope**: Cart Edit Verification (`src/core/compiler/circuit-breaker.ts`)
- **First Observed**: 2026-11-04 on frontend `11.4.201`
- **Confidence**: **Confirmed Fact** (reproduced on live calculator)
- **Status**: Handled (`GH-4-KAFKA-YEARLY-EDIT-DROP`)

### Technical Cause
On the live Huawei Cloud Pricing Calculator, Kafka instances can be configured with monthly or yearly billing durations.

1. When a yearly Kafka instance is initially configured and added to a price list:
   - Stored price: reflects 1-year discounted package total.
   - Rated price: matches the stored price exactly.
2. When the user or verification agent re-opens the price list and clicks **Edit** on the Kafka card:
   - The calculator's cart refill routine fails to restore the yearly period stepper.
   - The form defaults back to 1-month or drops duration entirely, causing the displayed price on the Edit screen to drop below the saved list total.

### Practical Implication
The saved price list link (`autocalc apply`) is completely valid and displays the correct annual price to the customer. However, an unaccommodated fail-closed Edit gate would reject publication because the Edit view price does not match the stored list price.

### AutoCalc Handling
AutoCalc includes an explicit entry in the Known Defect Table (`src/core/compiler/circuit-breaker.ts`):
- Defect ID: `GH-4-KAFKA-YEARLY-EDIT-DROP`
- Affected service: `kafka`
- Condition: `billing === "yearly"`
- Behavior: When the stored list price matches the catalog rated price, the gate skips the Edit form verification and awards the `RATING_VERIFIED_EDIT_SKIPPED` tier. A warning is emitted informing the user of the upstream vendor bug.
