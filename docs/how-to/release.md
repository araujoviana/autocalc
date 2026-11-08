# Cut a release

The installers and `autocalc update` pick the newest `vX.Y.Z` tag of the repository
([ADR-0019](../adr/0019-distribution-bun-from-git-tags.md)). A release is a tag.

## Automated Releases (Pre-Push Hook)

Releases are automated via a git `pre-push` hook configured in `.githooks/pre-push`.
When running `bun install`, the `prepare` script automatically configures `core.hooksPath` to `.githooks`.

When pushing changes to `main`:
1. The hook inspects commits since the current version/tag.
2. It determines the bump level according to Conventional Commits:
   - **Breaking changes** (`BREAKING CHANGE:` in body or `!` after type, e.g. `feat!: ...`): bumps `major` (or `minor` in initial development `0.x`).
   - **Features** (`feat:`): bumps `minor`.
   - **Fixes & Refactors** (`fix:`, `perf:`, `refactor:`): bumps `patch`.
   - **Non-functional changes** (`docs:`, `chore:`, `style:`, `test:`, `ci:`): no bump (`none`).
3. If a bump is required, it automatically updates `package.json`, commits `chore(release): vX.Y.Z`, and creates the annotated tag `vX.Y.Z`.
4. Pushes to other branches (e.g., feature branches) are ignored by the hook.

```bash
git push origin main
```

## Manual Version Bumping

You can inspect the calculated bump or trigger a bump manually on demand using the CLI:

```bash
# Preview the calculated next version and analyzed commit count (no mutations)
bun run bump --dry-run

# Calculate increment, update package.json, commit, and create git tag
bun run bump

# Force a patch bump even if all commits are non-functional (e.g. docs/chore)
bun run bump --force
```

Alternatively, you can run `bun scripts/bump-version.ts` directly.

## Tag Format and Semantics

Tags are compared as numbers, so `v0.10.0` is newer than `v0.9.0`. Tags that are not exactly
`vX.Y.Z` (a `-rc1` suffix, `nightly`) are ignored by both installers and `update`. A tag is not
a promise that the live calculator still matches: run `autocalc doctor` first.

Check the newly published tag from a clean shell: `autocalc update` prints `old -> X.Y.Z`.
