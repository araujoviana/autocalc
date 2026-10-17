# Spec Delta

## Purpose

Order the candidates for a requirement so the human sees the best fit first, and allow an
automatic choice only when a candidate matches the requirement exactly.

## ADDED Requirements

### Requirement: Candidates are ranked by covers, closest, cheapest, newest
For a requirement with minimum numbers (for example vCPUs and memory), ranking SHALL order
candidates first by whether they cover every minimum, then by how close they are to the
minimums, then by price, then by newest generation. A candidate that does not cover a minimum
SHALL stay in the list, after every covering one.

#### Scenario: Covering beats cheaper
- **WHEN** a 4 vCPU / 16 GB requirement has a 2 vCPU / 8 GB candidate at $10 and an 8 vCPU / 32 GB candidate at $80
- **THEN** the 8 vCPU / 32 GB candidate ranks first and the other is last, marked as not covering

#### Scenario: Ties fall through to price, then generation
- **WHEN** two candidates have the same size and the same price and differ in generation
- **THEN** the newer generation ranks first

### Requirement: Each candidate carries a short factual reason
Every ranked candidate SHALL have a one-line reason that states what it covers or misses and
why it sits where it does. The reason SHALL contain no filler.

#### Scenario: Reason for the best of several exact matches
- **WHEN** three candidates match 4 vCPU / 16 GB exactly and one is the cheapest
- **THEN** that candidate's reason names the numbers and says it is the cheapest of 3 exact matches

### Requirement: Only an exact match may be auto-confirmed
A requirement SHALL be marked auto-confirmable only when its top candidate covers every minimum
with equal values, and, if the requirement names a spec, has that spec. Otherwise it SHALL stay
undecided until a human decides.

#### Scenario: Exact match
- **WHEN** a candidate has exactly the requested vCPUs and memory
- **THEN** the ranking reports the requirement as auto-confirmable

#### Scenario: Size-up is not exact
- **WHEN** the best candidate has more memory than requested
- **THEN** the ranking reports the requirement as needing a human decision, with the difference in its reason

#### Scenario: Named spec missing
- **WHEN** a requirement names a spec that is not among the candidates
- **THEN** no candidate is auto-confirmable
