# Tasks

## 1. Pure logic (no browser)

- [ ] 1.1 Add a module with the result model (`ok`/`mismatch`/`unavailable`, stored and Edit amounts, line diff) and the line-diff and tolerance functions. Verified by unit tests: equal lines, added bandwidth line, changed disk size, tolerance edge at 0.01 (`uv run pytest tests/test_edit_check.py`).
- [ ] 1.2 Add the ECS public-IP agreement rule to `validate.py` with the label tokens in one commented constant. Verified by tests for EIP-less card with default state (reported), consistent no-EIP card (clean), consistent EIP card (clean), non-ECS card (ignored).
- [ ] 1.3 Add `PAYLOAD_TOO_LARGE` to `errors.py` and map HTTP 413 in the list-creation call, including card count and the split hint. Verified by a test that stubs a 413 response and asserts the code, count and hint, and that no retry happens.

## 2. Browser check

- [ ] 2.1 Implement the anonymous per-card Edit run: fresh headless context, dismiss first-run dialog and cookie banner, hydrate from the card, press Edit, capture the page's rating request and response. Verified by a `live`-marked test that builds an ECS card with the page and gets `ok` with the exact stored amount.
- [ ] 2.2 Return `unavailable` with a reason for every failure path (missing store or storage hook, no Edit control, no rating call, timeout, unsupported service). Verified by tests that run the runner against a stub page object for each failure.
- [ ] 2.3 Verify detection with tampered cards. Verified by a `live` test: dropping the public-IP form state from a no-EIP card gives `mismatch` with a bandwidth line named; adding a data disk only to the products gives `ok` only if the Edit amount agrees, otherwise `mismatch`.

## 3. CLI and doctor

- [ ] 3.1 Add `autocalc edit-check <id-or-url>`: read the list with the anonymous reader, run the check per card with bounded concurrency, print a per-card table and a summary, exit non-zero unless every card is `ok`. Verified by running it on a throwaway list the test creates and on a stubbed mixed result (exit codes asserted).
- [ ] 3.2 Make `doctor` probe the server with the stored session (no refresh, no browser) and print accepted, rejected with the login hint, or no session. Verified by tests with a stubbed server answer for each of the three states, and by `uv run autocalc doctor` output.

## 4. Docs and specs

- [ ] 4.1 Document the Edit mechanism findings (Edit reads `rewriteValue` only, defaults fill gaps, the 0.18688 to 0.32738 example, 413 observation) in `docs/explanation/huawei/edit-vs-list-price.md`, and add `edit-check` to the CLI reference. Verified by `uv run --group docs mkdocs build --strict`.
- [ ] 4.2 Remove or reassign roadmap rows this change affects and sync the main specs on archive. Verified by `openspec validate edit-check --strict`.
