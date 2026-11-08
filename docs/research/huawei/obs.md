# Huawei OBS (Object Storage Service) Research

- **Service**: Object Storage Service (`obs`)
- **Calculator Frontend Version**: `CBC-PortalCalculator/11.4.201`
- **Region Tested**: `sa-brazil-1` (São Paulo), `ap-southeast-1` (Hong Kong)
- **Status**: Verified in AutoCalc (v0.4.0)

This document provides technical details on the quirks, form dependencies, and circuit-breaker behavior of Huawei Cloud's Object Storage Service on the pricing calculator.

---

## RES-003: Cascaded Control Rewrite Drop

- **Scope**: Cart Edit Verification (`src/core/compiler/circuit-breaker.ts`)
- **First Observed**: 2026-11-02 (`11.4.201`)
- **Confidence**: **Confirmed Fact** (verified by JavaScript source analysis)
- **Status**: Handled (`GH-2-OBS-STORAGE-EDIT-DROP`)

### Technical Cause
In the calculator's `framework.js` (`L45928–L45944`), the internal function `changeNextStatus` handles cascaded components:
```javascript
// framework.js L45928
function changeNextStatus(target, source) {
  if (!source.value || source.value.length === 0) {
    target.rewriteValue = null;
    target.value = null;
  }
}
```
In the OBS form configuration, `calculator_multiAZ_radio` (redundancy) is cascaded on `calculator_storageType_switch` (storage class). When the cart opens for Edit:
1. `template-render` populates stored rewrite values.
2. `calculator_storageType_switch` begins its reactive emission cycle.
3. During the brief asynchronous initialization window before the switch value settles, `source.value` evaluates as empty.
4. `changeNextStatus` triggers and clears the pending rewrite value of `calculator_multiAZ_radio` and its child capacity steppers.
5. As a result, when the page finishes loading, the storage capacity stepper drops to `0`, causing the displayed price on the Edit screen to drop to `$0.00` (or traffic-only costs), even though the saved cart item has the correct capacity.

### AutoCalc Handling
Because the stored price and rated price are verified and match, AutoCalc recognizes this known vendor defect and routes OBS pay-per-use cards to the `RATING_VERIFIED_EDIT_SKIPPED` circuit breaker tier. The publish gate passes the quote and outputs a clear warning:
```
[warning] Edit check bypassed for OBS: known vendor SPA defect drops capacity stepper on edit (GH-2-OBS-STORAGE-EDIT-DROP). Stored price verified against catalog rating.
```

---

## RES-004: Stepper Order and Multi-AZ Replay

- **Scope**: Form Encoding (`src/core/services/obs.ts`)
- **First Observed**: 2026-11-07
- **Confidence**: **Confirmed Fact**
- **Status**: Fixed in TypeScript implementation

### Technical Cause
The OBS form dynamically renders capacity steppers based on active radio buttons. In the historical Python implementation and early TS port:
1. The builder assigned request and capacity steppers into the form state dictionary before `storageType_switch` and `multiAZType`.
2. When replaying form state, Playwright executed steps in dictionary key order.
3. For Warm, Cold, and multi-AZ configurations, the corresponding stepper controls (`UNSET_Stepper_1`, etc.) were not yet rendered when the automation attempted to type into them, failing with:
   ```
   no control calculator_multiAZ_radio_Stepper_1
   ```

### AutoCalc Handling
`src/core/services/obs.ts` explicitly enforces step sequencing:
1. Select storage class (`calculator_storageType_switch`).
2. Select redundancy (`calculator_multiAZ_radio`).
3. Set capacity stepper (`UNSET_Stepper_0` / `UNSET_Stepper_1`).
4. Set request, traffic, and retention lines.

---

## RES-005: Delete vs. Transition Measure Swap

- **Scope**: Replay & Metering (`src/core/services/obs.ts`)
- **First Observed**: 2026-11-07
- **Confidence**: **Confirmed Fact**
- **Status**: Fixed

### Technical Cause
The calculator page uses multiple numbered request steppers:
- `Request_stepper4`: **Delete requests** (Measure ID 31, billed per 1,000 requests).
- `Request_stepper5`: **Lifecycle transition requests** (Measure ID 14, billed per 10,000 requests).

A historical mapping inverted these two fields: transition values were written to stepper 4, and delete values to stepper 5. Real corpus inspection (`tests/fixtures/corpus/0865b3a0380911f1b441cb5fd260a270.json`) confirmed the true mapping.

### AutoCalc Handling
Corrected in `src/core/services/obs.ts` and regression-tested in `tests/unit/audit-regressions.test.ts`.

---

## Card Budgeting & Stepper Bounds

### 102,400 Stepper Limit
The calculator's capacity steppers accept an integer between `1` and `102,400` in the chosen unit (`GB` or `TB`). Submitting raw values exceeding `102,400` without changing the unit causes validation failure.

AutoCalc handles this at two levels:
1. **Physical Dimensional Units**: The compiler automatically selects `TB` scaling when appropriate.
2. **Workload Partitioning**: If a single storage volume exceeds 102,400 TB, `src/core/compiler/ir.ts` automatically partitions the workload across multiple physical cards while preserving tiered traffic metrics on Card 1.
