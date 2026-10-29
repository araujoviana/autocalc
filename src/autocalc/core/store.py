"""Draft store: one JSON file per draft under the user data directory, written atomically."""

from __future__ import annotations

import json
import os
import re
import secrets
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from autocalc.auth import data_dir
from autocalc.core.model import Draft
from autocalc.errors import ValidationError

_STORE_LOCK = threading.RLock()

_ID = re.compile(r"^d-[0-9a-f]{8}$")


class DraftStore:
    def __init__(self, root: Path | str | None = None):
        self.root = Path(root) if root else data_dir()
        self.dir = self.root / "drafts"

    @contextmanager
    def lock(self, draft_id: str):
        """Hold a local-process and OS advisory lock for a draft transaction."""
        self._path(draft_id)  # validate before deriving a lock path
        with self._file_lock(draft_id):
            yield

    @contextmanager
    def _file_lock(self, key: str):
        self.dir.mkdir(parents=True, exist_ok=True)
        with _STORE_LOCK, (self.dir / f"{key}.lock").open("a+b") as handle:
            if os.name == "nt":
                import msvcrt
                handle.seek(0)
                if not handle.read(1):
                    handle.write(b"0")
                    handle.flush()
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                if os.name == "nt":
                    handle.seek(0)
                    msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    @staticmethod
    def new_id() -> str:
        return f"d-{secrets.token_hex(4)}"

    def _path(self, draft_id: str) -> Path:
        if not isinstance(draft_id, str) or not _ID.fullmatch(draft_id):
            raise ValidationError(f"No draft {draft_id!r}.", field="draft_id")
        return self.dir / f"{draft_id}.json"

    def save(self, draft: Draft) -> None:
        path = self._path(draft.id)
        self.dir.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", dir=self.dir, suffix=".tmp", delete=False, encoding="utf-8") as f:
            json.dump(draft.to_dict(), f, indent=2)
            tmp = Path(f.name)
        os.replace(tmp, path)

    def load(self, draft_id: str) -> Draft:
        path = self._path(draft_id)
        if not path.exists():
            raise ValidationError(f"No draft {draft_id!r}.", field="draft_id",
                                  hint="Create a draft with draft_quote, or check the draft id.")
        return Draft.from_dict(json.loads(path.read_text(encoding="utf-8")))

    @property
    def _index(self) -> Path:
        return self.dir / "published.json"

    def link(self, list_id: str, draft_id: str) -> None:
        """Remember which draft produced a saved list."""
        with self._file_lock("published"):
            index = json.loads(self._index.read_text(encoding="utf-8")) if self._index.exists() else {}
            self.dir.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", dir=self.dir, suffix=".tmp", delete=False, encoding="utf-8") as f:
                json.dump({**index, list_id: draft_id}, f, indent=2)
                tmp = Path(f.name)
            os.replace(tmp, self._index)

    def draft_for(self, list_id: str) -> str | None:
        index = json.loads(self._index.read_text(encoding="utf-8")) if self._index.exists() else {}
        return index.get(list_id)

    def inspect(self, draft_id: str) -> dict[str, Any]:
        with self.lock(draft_id):
            draft = self.load(draft_id)
            state = "published" if draft.publication else "unknown_outcome" if draft.publishing else "ready" if not draft.pending() else "pending"
            return {"draft_id": draft.id, "state": state, "pending": draft.pending(), "publication": draft.publication}

    def recover(self, draft_id: str, confirmed_no_remote_list: bool, justification: str) -> dict[str, Any]:
        """Clear an ambiguous local attempt only after an explicit external reconciliation."""
        if confirmed_no_remote_list is not True:
            raise ValidationError("Check your saved lists and explicitly confirm that the attempted publication created no list.", field="confirmed_no_remote_list")
        if not isinstance(justification, str) or not justification.strip():
            raise ValidationError("Recovery needs a reconciliation justification.", field="justification")
        with self.lock(draft_id):
            draft = self.load(draft_id)
            if draft.publication or not draft.publishing:
                raise ValidationError("Only a publication with an unknown outcome can be reset.", field="draft_id")
            from autocalc.core.runs import RunRecord
            RunRecord(self.root, draft.id).append("publication_recovery", justification=justification)
            draft.publishing = False
            self.save(draft)
        return {"draft_id": draft_id, "state": "ready"}

    def list(self) -> list[dict[str, Any]]:
        files = sorted(self.dir.glob("d-*.json"), key=lambda p: p.stat().st_mtime, reverse=True) if self.dir.exists() else []
        out = []
        for f in files:
            d = json.loads(f.read_text(encoding="utf-8"))
            out.append({"id": d["id"], "customer": d["customer"], "created": d["created"],
                        "state": "published" if d.get("publication") else "unknown_outcome" if d.get("publishing") else "draft"})
        return out
