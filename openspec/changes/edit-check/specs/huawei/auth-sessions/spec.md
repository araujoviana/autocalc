# Spec Delta

## ADDED Requirements

### Requirement: Doctor reports server-side session validity
`autocalc doctor` SHALL ask the server whether the stored session is accepted and report the
answer: accepted, rejected (with the hint to run `autocalc login`), or no session stored. It
SHALL NOT report a session as logged in on the strength of its stored age alone, and SHALL NOT
launch a browser or attempt a refresh while doing so.

#### Scenario: Rejected session
- **WHEN** a session is stored but the server answers that the user is invalid
- **THEN** doctor reports the session as rejected with the `autocalc login` hint

#### Scenario: Accepted session
- **WHEN** the server accepts the stored session
- **THEN** doctor reports it as logged in
