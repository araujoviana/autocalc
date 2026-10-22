## ADDED Requirements

### Requirement: Unverified services are recorded with a reason
A quotable service that is not on the verified list SHALL be listed in the v1 scope document
with its status and, when its form could not be replayed or its Edit price differed, the reason.

#### Scenario: Service fails verification
- **WHEN** a live run shows a service's stored, Edit and rating amounts disagree, or its form cannot be replayed
- **THEN** the service is not on the verified list and the scope document lists it as *later* with that reason
