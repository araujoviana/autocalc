"""The schema file format. ``model_json_schema()`` of ``ServiceSchema`` is the published JSON Schema."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Range(BaseModel):
    model_config = ConfigDict(extra="forbid")
    min: float | None = None
    max: float | None = None
    step: float = 1
    default: float | None = None
    unit: str | None = None
    when: str | None = None  # regex on the selected resource spec code; absent = always


class Control(BaseModel):
    """One form control. Generated fields come from the page; ``option``, ``note`` and
    ``unsupported`` are hand-written and survive regeneration."""

    model_config = ConfigDict(extra="forbid")
    id: str
    kind: str
    title: str | None = None
    value_type: str | None = None
    option_key: str | None = None
    default: str | float | None = None
    values: Literal["catalog"] | None = None  # option values depend on region/earlier choices
    ranges: list[Range] = Field(default_factory=list)
    after: list[str] = Field(default_factory=list)  # immediate predecessor; closure is transitive
    after_source: Literal["order", "observed"] = "order"
    option: str | None = None  # hand-written: the name callers use
    unsupported: bool = False  # hand-written: deliberately not mapped
    note: str | None = None  # hand-written
    modes: list[str] = Field(default_factory=list)  # hand-written: only shown in these billing modes


class ServiceSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    service: str
    frontend: str | None = None  # CBC-PortalCalculator/<version>
    controls: list[Control]
