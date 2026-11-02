"""Build a service schema from the page's controls. Pure: the live read is ``page_controls``."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from autocalc.schema.model import Control, Range, ServiceSchema

FILES = Path(__file__).parent / "files"
HAND_WRITTEN = ("option", "unsupported", "note", "modes")


def build(service: str, raw: list[dict[str, Any]], frontend: str | None,
          existing: ServiceSchema | None = None) -> ServiceSchema:
    """Controls in form order (top, then left); hand-written fields carried over by control id."""
    kept = {c.id: c for c in existing.controls} if existing else {}
    seen: dict[str, dict[str, Any]] = {}
    for r in sorted(raw, key=lambda r: (r.get("y", 0), r.get("x", 0))):
        seen.setdefault(r["id"], r)  # a control mounted twice is one control
    controls: list[Control] = []
    for r in seen.values():
        old = kept.get(r["id"])
        controls.append(Control(
            id=r["id"], kind=r["kind"], title=r.get("title"), value_type=r.get("value_type"),
            option_key=r.get("option_key"), default=r.get("default") or None,
            values="catalog" if r.get("options") else None,
            ranges=[Range(**x) for x in r.get("ranges", [])],
            after=[controls[-1].id] if controls else [],
            **{k: getattr(old, k) for k in HAND_WRITTEN} if old else {}))
    # shortcut: the default-mode page hides mode-specific controls, so they stay hand-listed (`modes`);
    # upgrade by pulling once per billing mode.
    controls += [c for c in kept.values() if c.modes and c.id not in seen]
    return ServiceSchema(service=service, frontend=frontend, controls=controls)


def dump(schema: ServiceSchema) -> str:
    return yaml.safe_dump(schema.model_dump(mode="json", exclude_defaults=True),
                          sort_keys=False, allow_unicode=True)


def load(text: str) -> ServiceSchema:
    return ServiceSchema.model_validate(yaml.safe_load(text))


def load_service(service: str) -> ServiceSchema | None:
    if not service.isalnum():
        raise ValueError(f"Not a service id: {service!r}")
    path = FILES / f"{service}.yaml"
    return load(path.read_text(encoding="utf-8")) if path.exists() else None


def pull(service: str) -> ServiceSchema:
    """Read the live page (anonymous, saves nothing) and merge it over the committed schema."""
    from autocalc import frontend
    from autocalc.page.controls import page_controls
    return build(service, page_controls(service), frontend.live_version(), load_service(service))


def coverage(schema: ServiceSchema) -> dict[str, Any]:
    """Mapped = has an option name; unsupported = deliberately not mapped; the rest is unmapped."""
    mapped = [c.id for c in schema.controls if c.option and not c.unsupported]
    unsupported = [c.id for c in schema.controls if c.unsupported]
    unmapped = [c.id for c in schema.controls if not c.option and not c.unsupported]
    total = len(mapped) + len(unmapped)
    return {"service": schema.service, "mapped": mapped, "unmapped": unmapped, "unsupported": unsupported,
            "mapped_percent": round(100 * len(mapped) / total) if total else 100}


def diff(old: ServiceSchema | None, new: ServiceSchema) -> dict[str, list[str]]:
    """Added, removed and changed controls; hand-written fields are ignored. Writes nothing."""
    def gen(c: Control) -> dict[str, Any]:
        return c.model_dump(mode="json", exclude=set(HAND_WRITTEN))
    before = {c.id: gen(c) for c in old.controls if not c.modes} if old else {}
    after = {c.id: gen(c) for c in new.controls if not c.modes}
    return {"added": sorted(after.keys() - before.keys()), "removed": sorted(before.keys() - after.keys()),
            "changed": sorted(i for i in after.keys() & before.keys() if after[i] != before[i])}


def stale_notes(live: str | None) -> list[str]:
    """One line per committed schema generated on another frontend version than ``live``."""
    if not live:
        return []
    schemas = (load(f.read_text(encoding="utf-8")) for f in sorted(FILES.glob("*.yaml")))
    return [f"schema {s.service} was generated on frontend {s.frontend}, the live one is {live}  "
            f"-> autocalc schema diff {s.service}" for s in schemas if s.frontend != live]
