# Spec Delta

## Purpose

Explain any quote after the fact: what was asked, what was considered, who chose what and
why, and how long each step took.

## ADDED Requirements

### Requirement: Each draft has an append-only run record
Each draft SHALL have one run record, a file of one JSON object per line, under the user data
directory. Events SHALL only be appended; existing lines SHALL NOT be rewritten. Every event
SHALL carry a UTC timestamp and a kind.

#### Scenario: Events accumulate
- **WHEN** a draft is created and a human later decides a requirement
- **THEN** the record holds the earlier events unchanged followed by the new decision event

### Requirement: The record explains every decision
The record SHALL hold each requirement, the candidates considered for it in rank order, and
each decision with `auto` or `human` and its justification.

#### Scenario: Reading a record
- **WHEN** a record is read back for a draft with one auto and one human decision
- **THEN** it shows both decisions with who made them and the justification of each

### Requirement: Steps are timed
The record SHALL hold the elapsed milliseconds of each timed step, so slow steps are visible.

#### Scenario: Timed step
- **WHEN** a step runs inside a timing block
- **THEN** the record gains an event with the step name and a non-negative elapsed time, even if the step raises

### Requirement: Records stay on the machine
Run records hold customer requirements. They SHALL be written only under the user data
directory and SHALL NOT be sent anywhere or written into the repository.

#### Scenario: Location
- **WHEN** `AUTOCALC_DATA` points to a directory
- **THEN** records are written under that directory and nowhere else
