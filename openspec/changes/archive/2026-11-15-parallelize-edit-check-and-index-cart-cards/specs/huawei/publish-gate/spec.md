## MODIFIED Requirements

### Requirement: The gate fails closed
When a check cannot run, such as the browser not starting or a card's Edit view not opening in
time, the system SHALL treat it as a failure, delete the list and raise `GATE_FAILED`. It SHALL
NOT return a link for a card it could not check. Running Edit checks across parallel isolated
contexts SHALL NOT retry a card after a price or form-state mismatch and SHALL NOT suppress or
reorder any per-card failure.

#### Scenario: Edit view cannot be read
- **WHEN** a card's Edit view does not open
- **THEN** that card is reported as failed with the reason and no link is returned

#### Scenario: Deletion fails
- **WHEN** the gate fails and the list cannot be deleted
- **THEN** the error names the list id so the user can delete it by hand

#### Scenario: Parallel Edit slice fails on one worker
- **WHEN** one worker context fails to open or rejects a card during parallel Edit verification while other workers pass
- **THEN** the gate treats the list as failed, deletes the saved list, and raises `GATE_FAILED` reporting every failing card by its list index
