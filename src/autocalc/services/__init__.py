"""Service profile registry (B0.1) + capability matrix (C2)."""

from __future__ import annotations

import importlib
from typing import Any

from autocalc.client import Calculator
from autocalc.services.base import REGISTRY, Builder  # noqa: F401

# modules loaded for their side effect of registering a builder
_MODULES = ("ecs", "evs", "cce", "obs", "rds", "sfs", "elb",
            "nat", "apig", "dline", "cbr", "apm", "waf", "function", "dew", "lts", "cci", "rabbitmq", "kafka", "nosql", "forms")


# Services whose page-encoded cards passed the live matrix (stored = Edit = rating), and the
# calculator frontend version they were verified on. publish_quote accepts only these.
VERIFIED = dict.fromkeys(
    ("ecs", "evs", "cce", "elb", "obs", "rds", "sfsturbo",  # spa-encoder
     "apig", "apm", "cbr", "cci", "dew", "dline", "function", "kafka", "lts", "nat", "nosql", "rabbitmq", "waf"),  # builder-wave-1
    "11.4.201")
VERIFIED.update(dict.fromkeys(
    ("gaussdb", "rdsformariadb", "taurusdb", "hrds", "redis", "memcached", "dds", "ddm", "drs", "sfs", "dss", "sdrs", "des"),
    "11.4.201"))  # builder-wave-2


def load_all() -> None:
    for m in _MODULES:
        try:
            importlib.import_module(f"autocalc.services.{m}")
        except ImportError:
            continue


def get_builder(service: str, calc: Calculator | None = None) -> Builder:
    load_all()
    factory = REGISTRY.get(service.lower())
    if factory is None:
        from autocalc.errors import ValidationError
        raise ValidationError(f"No builder for service {service!r}.", field="service",
                              allowed=sorted(REGISTRY))
    return factory(calc)


def supported_services() -> list[dict[str, Any]]:
    load_all()
    out = []
    for svc, factory in sorted(REGISTRY.items()):
        b = factory(None)
        out.append({"service": svc, "modes": list(getattr(b, "modes", ("monthly", "yearly", "ondemand"))),
                    "description": getattr(b, "description", "")})
    return out


def build(service: str, calc: Calculator | None = None, **opts: Any) -> dict[str, Any]:
    b = get_builder(service, calc)
    return b.build(**opts)
