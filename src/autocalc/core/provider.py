"""What the core needs from a cloud: requirement in, priced candidates out (ADR-0015)."""

from __future__ import annotations

from typing import Protocol

from autocalc.core.model import Candidate, Requirement


class Provider(Protocol):
    name: str

    def candidates(self, req: Requirement) -> list[Candidate]:
        """Priced SKUs that could serve ``req``; raises an actionable error when the region cannot."""
        ...
