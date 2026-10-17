"""Draft store: one JSON file per draft under the user data directory, written atomically."""

from __future__ import annotations

import json
import os
import re
import secrets
from pathlib import Path
from typing import Any

from autocalc.auth import data_dir
from autocalc.core.model import Draft
from autocalc.errors import ValidationError

_ID = re.compile(r"^d-[0-9a-f]{8}$")


class DraftStore:
    def __init__(self, root: Path | str | None = None):
        self.root = Path(root) if root else data_dir()
        self.dir = self.root / "drafts"

    @staticmethod
    def new_id() -> str:
        return f"d-{secrets.token_hex(4)}"

    def _path(self, draft_id: str) -> Path:
        if not _ID.match(draft_id):
            raise ValidationError(f"No draft {draft_id!r}.", field="draft_id")
        return self.dir / f"{draft_id}.json"

    def save(self, draft: Draft) -> None:
        path = self._path(draft.id)
        self.dir.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(draft.to_dict(), indent=2), encoding="utf-8")
        os.replace(tmp, path)

    def load(self, draft_id: str) -> Draft:
        path = self._path(draft_id)
        if not path.exists():
            raise ValidationError(f"No draft {draft_id!r}.", field="draft_id",
                                  hint="List drafts to see the ids that exist.")
        return Draft.from_dict(json.loads(path.read_text(encoding="utf-8")))

    def list(self) -> list[dict[str, Any]]:
        files = sorted(self.dir.glob("d-*.json"), key=lambda p: p.stat().st_mtime, reverse=True) if self.dir.exists() else []
        out = []
        for f in files:
            d = json.loads(f.read_text(encoding="utf-8"))
            out.append({"id": d["id"], "customer": d["customer"], "created": d["created"]})
        return out
