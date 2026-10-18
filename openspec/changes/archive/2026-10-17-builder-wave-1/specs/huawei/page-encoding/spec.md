# huawei/page-encoding delta

## ADDED Requirements

### Requirement: Verified services are listed with their frontend version
The system SHALL keep a list of the services verified for page encoding, each with the
calculator frontend version it was verified against. A service is on the list only after a live
run in which the stored, Edit and rating amounts agreed for every billing mode it sells (or the
mode is documented as unsupported).

#### Scenario: Frontend changed since verification
- **WHEN** the live calculator's frontend version differs from the one a service was verified against
- **THEN** `autocalc doctor` and `publish_quote` say so, naming the service and both versions, and the gate still decides each card

#### Scenario: Encode failure names the version
- **WHEN** the page cannot encode a verified service's card
- **THEN** the error names the service, the failing field or step and the live frontend version
