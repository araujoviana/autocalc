# Spec Delta

## ADDED Requirements

### Requirement: List title constraints and zero watermarking
The system SHALL validate that saved list titles do not exceed 55 characters and SHALL NOT inject
tool branding or watermarks (such as `autocalc` or tool identifiers) into user-facing titles or card names.

#### Scenario: Long title rejected before remote call
- **WHEN** a list title exceeds 55 characters
- **THEN** validation fails before calling the remote share endpoint with a clear length error

#### Scenario: Clean user-specified titles preserved
- **WHEN** a list is created from a declarative quote
- **THEN** the list title and card names match user definitions without automated tool prefixes or watermarks
