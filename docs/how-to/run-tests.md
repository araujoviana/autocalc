# Run the tests

## The CI gate

These commands mirror `.github/workflows/ci.yml`. Run them before pushing:

```bash
bun install --frozen-lockfile   # install locked dependencies
bun run check                   # TypeScript typecheck
bun run check:boundaries        # core/interface boundary checks
bun run test:offline            # offline tests: no network, session or corpus needed
mkdocs build --strict           # this documentation site
```

## Live checks (by hand)

```bash
bun run test:live                        # read-only checks against the real calculator
bun scripts/template-audit.ts            # golden-corpus Edit agreement check
bun tests/support/region-sweep.ts        # 50-service live page verification across regions
```

- `bun run test:live` needs network access. The golden corpus checks also need the local corpus
  ([Refresh the golden corpus](refresh-corpus.md)).

Synthetic public form requests in `tests/fixtures/public/` run offline in CI. They contain no
customer cards. The `Anonymous calculator drift` workflow can be dispatched manually and runs
weekly against anonymous page/rating endpoints. It needs no account secrets and saves no lists.
