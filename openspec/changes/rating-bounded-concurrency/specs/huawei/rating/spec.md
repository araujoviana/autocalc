## MODIFIED Requirements

### Requirement: Polite, sequential use
Rating reads MAY run in parallel, with at most 4 requests in flight at once. A rating request
that fails with a transport error, HTTP 429 or a 5xx answer SHALL be retried a bounded number of
times with a growing delay before it is reported as `UPSTREAM`. Saving, renaming and deleting
lists on the account SHALL run one at a time. No calculator rate limit has been measured, so the
cap of 4 is a politeness limit, not a known server limit.

#### Scenario: Batch of quotes
- **WHEN** an agent needs to price many items
- **THEN** it batches them into one rating request or prices them with no more than 4 requests in flight

#### Scenario: Throttled
- **WHEN** the rating endpoint answers HTTP 429
- **THEN** the request is retried after a delay and only reported as `UPSTREAM` once the retries are used up

#### Scenario: Account writes
- **WHEN** several lists are to be saved, renamed or deleted
- **THEN** each write finishes before the next starts
