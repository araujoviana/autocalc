## ADDED Requirements

### Requirement: Pages without a region control are encoded without a region
For a service whose recipe is marked regionless, the encoder SHALL fill the page without a region
step. For any other service a missing region control SHALL still fail the encode.

#### Scenario: Global service
- **WHEN** a card for a regionless service is encoded
- **THEN** no region is chosen and the page's card is returned

#### Scenario: Regional page lost its region control
- **WHEN** a service that is not regionless is encoded and the page has no region control
- **THEN** a `PAGE_ENCODE_FAILED` error names `global_REGIONINFO_region`
