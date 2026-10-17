# Cut a release

The installers and `autocalc update` pick the newest `vX.Y.Z` tag of the repository
([ADR-0013](../adr/0013-distribution-uv-tool-from-git-tags.md)). A release is a tag.

1. On `main`, with the tests green (`uv run pytest -m "not live"`), set `version` in
   `pyproject.toml` to the new number and commit it.
2. Tag the commit with the same number and push both:

    ```bash
    git tag v0.2.0
    git push origin main v0.2.0
    ```

3. Check it from a clean shell: `autocalc update` prints `old -> 0.2.0`.

Tags are compared as numbers, so `v0.10.0` is newer than `v0.9.0`. Tags that are not exactly
`vX.Y.Z` (a `-rc1` suffix, `nightly`) are ignored by both installers and `update`. A tag is not
a promise that the live calculator still matches: run `autocalc doctor` first.
