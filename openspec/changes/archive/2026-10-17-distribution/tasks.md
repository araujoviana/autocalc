# Tasks

## 1. Drop keyring

- [x] 1.1 Remove `_legacy_keyring` and the keyring deletes from `auth._cleanup_legacy`, the `keyring` dependency from `pyproject.toml` (`uv lock`), and the keyring fakes from `tests/test_auth.py`. Update `docs/explanation/huawei/sessions.md`. Verify: `uv run pytest -m "not live" tests/test_auth.py` passes and `grep -rn keyring src pyproject.toml` finds nothing

## 2. `autocalc update`

- [x] 2.1 Add `src/autocalc/update.py` (`latest_tag`, `update`) and the `update [--to]` command in `cli.py`. Verify with offline tests that fake `git ls-remote` and `uv`: newest tag wins by version, not by text (`v0.10.0` > `v0.9.0`); a bad `--to` fails before running `uv`; no tag fails with a message; a `uv` failure fails with a message

## 3. Installers

- [x] 3.1 Add `install.sh` and `install.ps1` per the spec. Verify: `shellcheck install.sh` is clean; `sh install.sh` with `AUTOCALC_REPO` pointing at a local test repository tagged `v0.0.1` and `UV_TOOL_DIR`/`UV_TOOL_BIN_DIR` set to a temp dir installs a working `autocalc --help`; with no tag it exits non-zero and installs nothing. The PowerShell twin is reviewed by reading (no `pwsh` on this machine) and said so in the docs

## 4. Docs and verification

- [x] 4.1 README and `docs/tutorials/first-quote.md` lead with the installer; `docs/reference/cli.md` gains `update`; add `docs/how-to/release.md` (tag, push, installers pick it up) to the nav; update `docs/roadmap.md` (drop done rows, add the update-notice row). Verify: `uv run --group docs mkdocs build --strict`
- [x] 4.2 Run `uv run ruff check`, `uv run pytest -m "not live"`, `openspec validate distribution --strict`. Sync the specs by hand, archive the change, commit
