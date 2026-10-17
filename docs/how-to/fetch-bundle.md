# Fetch the calculator bundle

The calculator's frontend bundle (`framework.js`) is the source of truth for how cards, form
state and labels are built. It is third-party code, so it is never committed.

```bash
uv run python scripts/fetch_bundle.py                    # the version the live site serves
uv run python scripts/fetch_bundle.py --version 11.4.201 # a specific version
```

The script prints the path it wrote, `.cache/bundle/framework-<version>.js`, which is
gitignored. Old versions can disappear from the CDN. The 11.4.201 build these docs were written
against is in git history: `git show df99f46:docs/evidence/bundle/framework.js`.
