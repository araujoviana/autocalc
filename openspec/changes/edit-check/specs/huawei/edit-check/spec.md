# Spec Delta

## Purpose
Verify, without a login and without writing anything, that each card of a saved list re-prices to its stored amount when the website's Edit view recomputes it.

## ADDED Requirements

### Requirement: Per-card Edit verification
The system SHALL, for a saved list given by id or share URL, open each card in the calculator's
Edit view in a headless browser and report, per card: the stored amount, the amount the page
recomputes, whether they agree within 0.01, and the product lines that differ. The check SHALL
read the list anonymously and SHALL NOT create, change or delete any list.

#### Scenario: Card that survives Edit
- **WHEN** a card's Edit view recomputes the stored amount
- **THEN** the card is reported `ok` with both amounts

#### Scenario: Card that drifts
- **WHEN** a card stored without its public-IP form state is checked and Edit adds a bandwidth line
- **THEN** the card is reported `mismatch`, both amounts are shown, and the added line is named

#### Scenario: No login needed
- **WHEN** no session exists
- **THEN** the check runs and reports normally

### Requirement: Exact amounts, not displayed rounding
The recomputed amount SHALL be the amount the calculator obtains from its own rating request
during Edit, not the rounded figure shown on the page.

#### Scenario: Small hourly price
- **WHEN** a pay-per-use card stored at 0.18688 is checked
- **THEN** the reported Edit amount keeps full precision rather than showing 0.19

### Requirement: Fail closed
A card the check cannot evaluate, for example an unsupported service, a changed page, or a
timeout, SHALL be reported `unavailable` with the reason. `unavailable` SHALL NOT be reported or
counted as `ok`, and the command SHALL exit non-zero unless every card is `ok`.

#### Scenario: Page internals changed
- **WHEN** the calculator no longer exposes what the check relies on
- **THEN** every card is `unavailable` with that reason and the exit status is non-zero

#### Scenario: Mixed result
- **WHEN** one card is `mismatch` and the rest are `ok`
- **THEN** the summary lists the mismatching card and the exit status is non-zero

### Requirement: Isolation
Each card SHALL be checked in its own browser context so that one card's state cannot affect
another's result, and the user's login browser profile SHALL NOT be used.

#### Scenario: Two cards in one list
- **WHEN** a list holds two cards
- **THEN** each result is the same as when that card is checked alone
