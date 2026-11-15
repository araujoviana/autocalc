## MODIFIED Requirements

### Requirement: Edit price of a saved card can be checked
Given a share link, the Edit-price check SHALL open each card's Edit view anonymously and SHALL
report, per card, the stored amount, the amount the Edit view recomputes, and whether they are
equal to the cent. For multi-card lists, the check MAY partition disjoint card slices across
bounded parallel isolated anonymous browser contexts (`AUTOCALC_EDIT_WORKERS`), reassembling
per-card results in original list order.

#### Scenario: Faithful card
- **WHEN** the check runs on a list whose card re-prices on Edit to its stored amount
- **THEN** that card is reported with both amounts and as equal

#### Scenario: Edit view cannot be read
- **WHEN** a card's Edit view does not open or does not finish re-pricing in time
- **THEN** that card is reported as failed with the reason, never as equal

#### Scenario: Parallel Edit check preserves deterministic list order and failures
- **WHEN** a multi-card list is checked across multiple parallel anonymous browser contexts and one card or slice fails
- **THEN** results are returned sorted by card index (`0..N-1`), passing cards retain their amounts, and every card in a failing slice or with a mismatch is reported as failed
