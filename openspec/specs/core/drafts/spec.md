# core/drafts Specification

## Purpose

Hold a quote in progress as provider-neutral data that survives between commands, with every
choice attributed to the agent or a human and explained.

## Requirements

### Requirement: A draft holds requirements and decisions
A draft SHALL hold a customer label, a provider name and a list of requirements. Each
requirement SHALL carry its own service, region, billing mode, quantity and minimums, and MAY
carry an availability zone. Requirements in different regions SHALL be allowed in one draft.

#### Scenario: Two regions in one draft
- **WHEN** a draft is created with one requirement in `sa-brazil-1` and one in `la-south-2`
- **THEN** the draft keeps both with their own regions

### Requirement: Every decision is attributed and justified
A decision SHALL name its requirement, the chosen spec, who made it (`auto` or `human`) and a
non-empty justification. The draft SHALL refuse a decision that has no justification, or names
a requirement it does not contain.

#### Scenario: Auto decision on exact match
- **WHEN** a draft is created and a requirement has an exact top candidate
- **THEN** that requirement has an `auto` decision whose justification is the candidate's reason

#### Scenario: Inexact requirement stays pending
- **WHEN** a requirement has no exact top candidate
- **THEN** it has no decision and is reported as pending

#### Scenario: Human decision
- **WHEN** a human decides a pending requirement with a spec and a justification
- **THEN** the draft records a `human` decision and no longer lists the requirement as pending

### Requirement: Drafts persist locally
A draft SHALL be saved as one file under the user data directory and loaded back equal to what
was saved. A write SHALL NOT leave a half-written file. Listing drafts SHALL return their ids
and customer labels, newest first. A draft SHALL NOT leave the machine.

#### Scenario: Round trip
- **WHEN** a draft with decisions is saved and loaded by id
- **THEN** the loaded draft equals the saved one

#### Scenario: Unknown id
- **WHEN** a draft id that was never saved is loaded
- **THEN** a clear not-found error names the id
