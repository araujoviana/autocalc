## MODIFIED Requirements

### Requirement: Each run uses its own browser context
Concurrent encodes and concurrent Edit-price checks SHALL execute in isolated browser contexts
that share no storage with another concurrent run, so overlapping runs cannot see or change
each other's cart. When an idle headless anonymous context is reused sequentially for a later
encode after a prior run completed cleanly, its storage (`localStorage`, `sessionStorage`, and
cookies) SHALL be cleared before the next run starts, and a context whose run failed SHALL be
closed rather than reused.

#### Scenario: Two encodes at once
- **WHEN** two different ECS cards are encoded concurrently
- **THEN** each result holds exactly the card for its own options

#### Scenario: Sequential context reuse clears prior cart state
- **WHEN** two cards are encoded sequentially through the pooled headless encoder
- **THEN** the second run starts with an empty cart and returns only the second card without opening residual storage from the first run

#### Scenario: Failed encode closes its context instead of recycling it
- **WHEN** a pooled encode attempt throws an error
- **THEN** that browser context is closed and a subsequent retry acquires a clean context
