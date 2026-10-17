"""Provider-neutral quote model: plain dataclasses that round-trip through JSON."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from autocalc.errors import ValidationError

VERSION = 1


@dataclass
class Requirement:
    """One line of a quote. ``needs`` holds numeric minimums by name (vcpus, memory_gb, ...)."""

    id: str
    service: str
    region: str
    billing: str
    quantity: int = 1
    needs: dict[str, float] = field(default_factory=dict)
    spec: str | None = None
    az: str | None = None
    group: str | None = None
    options: dict[str, Any] = field(default_factory=dict)  # passed to the service builder

    def to_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Requirement:
        return cls(**d)


@dataclass
class Candidate:
    spec: str
    region: str
    billing: str
    price: Decimal
    has: dict[str, float] = field(default_factory=dict)
    generation: int = 0
    description: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {**self.__dict__, "price": str(self.price)}

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Candidate:
        return cls(**{**d, "price": Decimal(d["price"])})


@dataclass
class Decision:
    requirement_id: str
    spec: str
    by: str  # "auto" | "human"
    justification: str

    def to_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Decision:
        return cls(**d)


@dataclass
class Draft:
    id: str
    customer: str
    provider: str
    requirements: list[Requirement] = field(default_factory=list)
    decisions: list[Decision] = field(default_factory=list)
    created: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    version: int = VERSION

    def add_decision(self, d: Decision) -> None:
        """Record a decision, replacing an earlier one for the same requirement."""
        if d.by not in ("auto", "human"):
            raise ValidationError("A decision is made by 'auto' or 'human'.", field="by", allowed=["auto", "human"])
        if not d.justification.strip():
            raise ValidationError("A decision needs a justification.", field="justification")
        ids = [r.id for r in self.requirements]
        if d.requirement_id not in ids:
            raise ValidationError(f"No requirement {d.requirement_id!r} in draft {self.id}.",
                                  field="requirement_id", allowed=ids)
        self.decisions = [x for x in self.decisions if x.requirement_id != d.requirement_id] + [d]

    def pending(self) -> list[str]:
        decided = {d.requirement_id for d in self.decisions}
        return [r.id for r in self.requirements if r.id not in decided]

    def to_dict(self) -> dict[str, Any]:
        return {"version": self.version, "id": self.id, "customer": self.customer, "provider": self.provider,
                "created": self.created, "requirements": [r.to_dict() for r in self.requirements],
                "decisions": [d.to_dict() for d in self.decisions]}

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Draft:
        return cls(id=d["id"], customer=d["customer"], provider=d["provider"], created=d["created"],
                   version=d.get("version", VERSION),
                   requirements=[Requirement.from_dict(r) for r in d["requirements"]],
                   decisions=[Decision.from_dict(x) for x in d["decisions"]])
