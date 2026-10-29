"""Region resolver.

Accepts a region id, a display name ("LA-Sao Paulo1"), or a city/country alias
("Santiago", "Brazil", "São Paulo"). Accent-insensitive; ambiguity is an error
that lists the choices.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from autocalc.errors import RegionAmbiguous, RegionNotFound

# The regions autocalc is built for, in priority order: São Paulo, Santiago, Singapore.
PRIMARY_REGIONS = ("sa-brazil-1", "la-south-2", "ap-southeast-3")


def primary_first(regions: list[str]) -> list[str]:
    """``regions`` with the primary ones first, in priority order, then the rest alphabetically."""
    rank = {r: i for i, r in enumerate(PRIMARY_REGIONS)}
    return sorted(regions, key=lambda r: (rank.get(r, len(rank)), r))


# Curated aliases -> region id. Covers the LATAM/global regions the team quotes.
_ALIASES: dict[str, str] = {
    "santiago": "la-south-2", "chile": "la-south-2", "la-south-2": "la-south-2",
    "sao paulo": "sa-brazil-1", "sao paulo1": "sa-brazil-1", "brazil": "sa-brazil-1",
    "brasil": "sa-brazil-1", "la-sao paulo1": "sa-brazil-1",
    "lima": "sa-peru-1", "peru": "sa-peru-1",
    "buenos aires": "sa-argentina-1", "argentina": "sa-argentina-1",
    "mexico city2": "la-north-2", "mexico city 2": "la-north-2", "la-north-2": "la-north-2",
    "mexico city1": "na-mexico-1", "mexico city 1": "na-mexico-1", "na-mexico-1": "na-mexico-1",
    "johannesburg": "af-south-1", "south africa": "af-south-1", "af-south-1": "af-south-1",
    "singapore": "ap-southeast-3", "hong kong": "ap-southeast-1", "cn-hong kong": "ap-southeast-1",
    "bangkok": "ap-southeast-2", "jakarta": "ap-southeast-4", "manila": "ap-southeast-5",
    "istanbul": "tr-west-1", "cairo": "af-north-1", "moscow": "ru-moscow-1",
    "kuala lumpur": "my-kualalumpur-1", "dublin": "eu-west-101",
    "paris": "eu-west-0",
}

# Deliberately ambiguous queries -> candidate region ids (agent must ask).
_AMBIGUOUS: dict[str, list[str]] = {
    "mexico": ["na-mexico-1", "la-north-2"],
    "eu": ["eu-west-0", "eu-west-101"],
    "europe": ["eu-west-0", "eu-west-101"],
}


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


class RegionResolver:
    """Resolve friendly region names to Huawei Cloud region ids."""

    def __init__(self, names: dict[str, str] | None = None):
        self.names = dict(names or {})

    @classmethod
    def from_menu(cls, menu: dict[str, Any]) -> RegionResolver:
        return cls(menu.get("global", {}))

    def _alias_index(self) -> dict[str, set[str]]:
        idx: dict[str, set[str]] = {}
        for rid, disp in self.names.items():
            for key in {_norm(rid), _norm(disp)}:
                if key:
                    idx.setdefault(key, set()).add(rid)
        for key, rid in _ALIASES.items():
            idx.setdefault(_norm(key), set()).add(rid)
        return idx

    def candidates(self, query: str) -> list[str]:
        q = _norm(query)
        if not q:
            return []
        idx = self._alias_index()
        if q in idx:
            return sorted(idx[q])
        if q in _AMBIGUOUS:
            return list(_AMBIGUOUS[q])
        # substring fallback on ids and display names
        hits: set[str] = set()
        for key, rids in idx.items():
            if len(q) >= 4 and (q in key or key in q):
                hits |= rids
        return sorted(hits)

    def resolve(self, query: str) -> str:
        """Return a single region id or raise RegionNotFound / RegionAmbiguous."""
        cands = self.candidates(query)
        if not cands:
            raise RegionNotFound(
                f"Unknown region {query!r}.",
                hint="Pass an id like 'sa-brazil-1' or a city such as 'Santiago'.",
                details={"query": query},
            )
        if len(cands) > 1:
            # Exact id match wins over substring collisions.
            if _norm(query) in {_norm(c) for c in cands}:
                return next(c for c in cands if _norm(c) == _norm(query))
            raise RegionAmbiguous(query, cands)
        return cands[0]

    def display(self, region: str) -> str:
        return self.names.get(region, region)
