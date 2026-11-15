## MODIFIED Requirements

### Requirement: Catalog responses are cached
Catalog responses SHALL be cached on disk for 24 hours, keyed by URL and parameters, in `~/.cache/autocalc` or the directory named by `AUTOCALC_CACHE`, and SHALL be memoized in memory within a single `Catalog` instance to avoid redundant disk reads, JSON parsing, validation, and label resolution. A refresh request SHALL bypass both the disk cache and the in-memory memoized entries and update them with the fresh response.

#### Scenario: Second read within TTL hits the cache
- **WHEN** the same product info is requested twice within 24 hours
- **THEN** the second request is served from disk with no network call

#### Scenario: Repeated reads within one session reuse parsed catalog data
- **WHEN** `skus()` or `productInfo()` is requested multiple times for the same service and region on the same `Catalog` instance without `refresh`
- **THEN** only the first call reads and parses the cached payload from disk and subsequent calls return the in-memory memoized result

#### Scenario: Refresh bypasses both memory and disk caches
- **WHEN** `productInfo()` or `skus()` is requested with `refresh` enabled after an earlier read on the same `Catalog` instance
- **THEN** the cached in-memory and disk entries are bypassed, the upstream payload is fetched again, and subsequent non-refresh reads observe the updated entry
