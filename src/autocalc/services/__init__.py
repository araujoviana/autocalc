"""Service profile registry (B0.1) + capability matrix (C2)."""

from __future__ import annotations

import importlib
from typing import Any

from autocalc.client import Calculator
from autocalc.services.base import REGISTRY, Builder  # noqa: F401
from autocalc.services.forms import RECIPES

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
VERIFIED.update(dict.fromkeys(
    ("er", "esw", "vpcep", "eip", "vpn", "cfw", "hss", "dbss", "dsc", "ssa", "reliability", "hecs",
     "ga", "cc", "aad", "edgesec", "ucs"),  # global pages, no region control
    "11.4.201"))  # builder-wave-3


# Acceptance of page defaults is not verification of requested configuration.

ACCEPTED_DEFAULT_ONLY = {service for service, recipe in RECIPES.items() if not recipe.controls}
for _service in ACCEPTED_DEFAULT_ONLY | {"function", "lts"}:
    VERIFIED.pop(_service, None)


def load_all() -> None:
    for m in _MODULES:
        importlib.import_module(f"autocalc.services.{m}")


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
        reason = None
        if svc in ACCEPTED_DEFAULT_ONLY:
            reason = "Only page defaults have been accepted; requested configuration is unverified."
        elif svc in {"function", "lts"}:
            reason = "Incomplete pricing or form mapping; publication remains blocked."
        elif svc in RECIPES and not b.spec_arg:
            reason = "Selected catalog specs have no verified form mapping."
        elif svc not in VERIFIED:
            reason = "No verified page publication support."
        out.append({"publication_supported": reason is None, "publication_blocked_reason": reason,
                    "verified_frontend": VERIFIED.get(svc), "service": svc, "modes": list(getattr(b, "modes", ("monthly", "yearly", "ondemand"))),
                    "description": getattr(b, "description", ""), "options": b.options()})
    return out


def build(service: str, calc: Calculator | None = None, **opts: Any) -> dict[str, Any]:
    b = get_builder(service, calc)
    return b.build(**opts)
