"""Refresh the golden-test corpus from the logged-in account's saved lists (read-only).

Lists the account's saved price lists (``share/list``, needs ``autocalc login``) and downloads
each one through the anonymous ``share/detail`` endpoint into ``tests/fixtures/corpus/``,
plus an ``index.json``. That folder is gitignored: it holds client quotes and never leaves
this machine. Nothing in the account is created, changed or deleted.

Run:  uv run python -m tests.support.pull_corpus
"""

from __future__ import annotations

import json
import sys
import time

from autocalc.client import Calculator
from autocalc.share import Session, share_detail
from tests.support.golden import CORPUS


def main() -> int:
    CORPUS.mkdir(parents=True, exist_ok=True)
    calc = Calculator()
    lists = Session().lists()
    print(f"{len(lists)} saved lists; downloading read-only into {CORPUS}")
    index, failed = [], []
    for x in lists:
        try:
            data = share_detail(calc, x["key"])
        except Exception as exc:  # noqa: BLE001 - report every failure at the end, keep going
            failed.append(f"{x['key']}: {str(exc)[:80]}")
            continue
        (CORPUS / f"{x['key']}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        index.append({k: x.get(k) for k in ("key", "name", "updateTime", "totalPrice")})
        time.sleep(0.3)  # polite, sequential
    (CORPUS / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"saved {len(index)}, failed {len(failed)}")
    for line in failed:
        print("  ", line)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
