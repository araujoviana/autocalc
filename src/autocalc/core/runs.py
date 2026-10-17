"""Run records (ADR-0009): append-only JSONL per draft, kept on the user's machine."""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class RunRecord:
    def __init__(self, root: Path | str, draft_id: str):
        self.path = Path(root) / "runs" / f"{draft_id}.jsonl"

    def append(self, kind: str, **data: Any) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps({**data, "t": datetime.now(UTC).isoformat(), "kind": kind}, default=str)
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")

    @contextmanager
    def step(self, name: str) -> Iterator[None]:
        start = time.perf_counter()
        try:
            yield
        finally:
            self.append("step", name=name, ms=round((time.perf_counter() - start) * 1000, 3))

    def read(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        return [json.loads(x) for x in self.path.read_text(encoding="utf-8").splitlines() if x]
